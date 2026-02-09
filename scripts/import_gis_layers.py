"""
GIS Layer Import Script
=======================
Extracts feature layers from GDB/SHP files and converts them to GeoJSON
in ITM (EPSG:2039) coordinate system for import into the manholes-mapper app.

Usage:
    python import_gis_layers.py [--output-dir OUTPUT_DIR]

Requirements:
    - ArcPy (comes with ArcGIS Pro)
    - Python 3.x

This script generates individual GeoJSON files for each layer, which can then
be uploaded via the admin UI or imported using the setup_layers.js script.
"""

import arcpy
import json
import os
import sys
from datetime import datetime

# ============================================
# Configuration - Layer Sources
# ============================================

LAYERS = [
    {
        "name": "מנות",
        "layer_type": "sections",
        "source": r"W:\GIS\תאגידי מים\מי רקת\analyzed_data\Geo_Point.gdb\מנות",
        "output": "sections.geojson",
        "style": {
            "strokeColor": "rgba(0, 100, 200, 0.6)",
            "fillColor": "rgba(0, 100, 200, 0.08)",
            "lineWidth": 2,
            "lineDash": [8, 4],
            "labelField": "name",
            "labelColor": "#0064c8",
            "labelFontSize": 11
        }
    },
    {
        "name": "שוחות סקר נכסים",
        "layer_type": "survey_manholes",
        "source": r"W:\GIS\תאגידי מים\מי רקת\analyzed_data\GDB\Raqat_GDB_1_12_2024\WaterEntities.gdb\SW_Manholes",
        "output": "survey_manholes.geojson",
        "fields": ["OBJECTID", "ManholeNum", "TL", "ManholeDia", "ManholeMat", "Status", "StreetName", "HouseNum", "Depth"],
        "style": {
            "strokeColor": "rgba(180, 60, 20, 0.7)",
            "fillColor": "rgba(180, 60, 20, 0.5)",
            "pointRadius": 4,
            "pointShape": "square",
            "labelField": "OBJECTID",
            "labelColor": "#b43c14",
            "labelFontSize": 9
        }
    },
    {
        "name": "קווי סקר נכסים",
        "layer_type": "survey_pipes",
        "source": r"W:\GIS\תאגידי מים\מי רקת\analyzed_data\GDB\Raqat_GDB_1_12_2024\WaterEntities.gdb\SW_Pipe",
        "output": "survey_pipes.geojson",
        "fields": ["OBJECTID", "PipeNum", "PipeDia", "PipeMat", "Status", "StreetName", "Length"],
        "style": {
            "strokeColor": "rgba(60, 140, 60, 0.7)",
            "fillColor": "rgba(60, 140, 60, 0.2)",
            "lineWidth": 2.5,
            "lineDash": [],
            "labelField": None,
            "labelColor": "#3c8c3c",
            "labelFontSize": 9
        }
    },
    {
        "name": "רחובות",
        "layer_type": "streets",
        "source": r"W:\GIS\תאגידי מים\מי רקת\raw_data\Addresses_streets_tveria\Streets\Streets.shp",
        "output": "streets.geojson",
        "style": {
            "strokeColor": "rgba(100, 100, 100, 0.5)",
            "fillColor": "rgba(100, 100, 100, 0.05)",
            "lineWidth": 1.5,
            "lineDash": [4, 2],
            "labelField": "ST_NAME",
            "labelColor": "#555",
            "labelFontSize": 10
        }
    },
    {
        "name": "כתובות",
        "layer_type": "addresses",
        "source": r"W:\GIS\תאגידי מים\מי רקת\raw_data\Addresses_streets_tveria\Addresses\Adresses.shp",
        "output": "addresses.geojson",
        "style": {
            "strokeColor": "rgba(150, 80, 150, 0.6)",
            "fillColor": "rgba(150, 80, 150, 0.4)",
            "pointRadius": 3,
            "pointShape": "circle",
            "labelField": "HOUSE_NUM",
            "labelColor": "#965096",
            "labelFontSize": 8
        }
    }
]

# Target coordinate system: Israel TM Grid (ITM) - EPSG:2039
ITM_WKID = 2039


def get_geometry_type(shape_type):
    """Map ArcPy shape types to GeoJSON geometry types."""
    mapping = {
        "Point": "Point",
        "Multipoint": "MultiPoint",
        "Polyline": "LineString",
        "Polygon": "Polygon"
    }
    return mapping.get(shape_type, shape_type)


def shape_to_geojson_coords(geometry, geom_type, precision=3):
    """Convert an ArcPy geometry to GeoJSON coordinates."""
    if geom_type == "Point":
        return [round(geometry.centroid.X, precision), round(geometry.centroid.Y, precision)]
    
    elif geom_type == "MultiPoint":
        return [[round(pt.X, precision), round(pt.Y, precision)] for pt in geometry]
    
    elif geom_type == "LineString":
        # Polyline may have multiple parts
        parts = []
        for part in geometry:
            line = []
            for pt in part:
                if pt is not None:
                    line.append([round(pt.X, precision), round(pt.Y, precision)])
            parts.append(line)
        
        if len(parts) == 1:
            return parts[0]
        else:
            # MultiLineString
            return parts
    
    elif geom_type == "Polygon":
        rings = []
        for part in geometry:
            ring = []
            for pt in part:
                if pt is not None:
                    ring.append([round(pt.X, precision), round(pt.Y, precision)])
            if ring:
                rings.append(ring)
        return rings
    
    return None


def convert_value(val):
    """Convert ArcPy field values to JSON-safe types."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if val != val:  # NaN check
            return None
        # Round floats to save space
        if isinstance(val, float):
            return round(val, 3)
        return val
    if isinstance(val, datetime):
        return val.isoformat()
    
    # Handle string encoding and whitespace
    if isinstance(val, str):
        cleaned = val.strip()
        if not cleaned:
            return None
        try:
            # Basic cleanup of potentially garbled text
            return cleaned.encode('utf-8', 'ignore').decode('utf-8')
        except:
            return cleaned
            
    return str(val)


def extract_layer(layer_config, output_dir):
    """Extract a single layer from GDB/SHP to GeoJSON."""
    source = layer_config["source"]
    output_file = os.path.join(output_dir, layer_config["output"])
    
    print(f"\n{'='*60}")
    print(f"Processing: {layer_config['name']}")
    print(f"Source: {source}")
    print(f"Output: {output_file}")
    
    if not arcpy.Exists(source):
        print(f"  WARNING: Source does not exist: {source}")
        print(f"  Skipping this layer.")
        return None
    
    # Get the spatial reference of the source
    desc = arcpy.Describe(source)
    source_sr = desc.spatialReference
    print(f"  Source CRS: {source_sr.name} (WKID: {source_sr.factoryCode})")
    
    # Target spatial reference (ITM)
    target_sr = arcpy.SpatialReference(ITM_WKID)
    
    # Check if reprojection is needed
    needs_reproject = source_sr.factoryCode != ITM_WKID
    if needs_reproject:
        print(f"  Will reproject from {source_sr.factoryCode} to {ITM_WKID}")
    else:
        print(f"  Already in ITM, no reprojection needed")
    
    # Get field names (excluding geometry fields)
    fields = []
    field_names = []
    for field in arcpy.ListFields(source):
        if field.type not in ("Geometry", "OID", "GlobalID", "Blob", "Raster"):
            fields.append(field)
            field_names.append(field.name)
    
    print(f"  Fields: {', '.join(field_names)}")
    
    # Get shape type
    shape_type = desc.shapeType
    geom_type = get_geometry_type(shape_type)
    print(f"  Geometry: {shape_type} -> {geom_type}")
    
    # Build feature collection
    features = []
    error_count = 0
    
    # Use SearchCursor with SHAPE@
    cursor_fields = ["SHAPE@"] + field_names
    
    with arcpy.da.SearchCursor(source, cursor_fields, spatial_reference=target_sr) as cursor:
        for row in cursor:
            try:
                geometry = row[0]
                if geometry is None:
                    continue
                
                # Convert geometry to GeoJSON coordinates
                coords = shape_to_geojson_coords(geometry, geom_type)
                if coords is None:
                    continue
                
                # Determine actual GeoJSON type (handle multi-part)
                actual_type = geom_type
                if geom_type == "LineString" and isinstance(coords[0][0], list):
                    actual_type = "MultiLineString"
                
                # Build properties
                properties = {}
                whitelist = layer_config.get("fields")
                for i, fname in enumerate(field_names):
                    if whitelist and fname not in whitelist:
                        continue
                    val = convert_value(row[i + 1])
                    if val is not None:
                        properties[fname] = val
                
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": actual_type,
                        "coordinates": coords
                    },
                    "properties": properties
                }
                features.append(feature)
                
            except Exception as e:
                error_count += 1
                if error_count <= 5:
                    print(f"  Error processing feature: {e}")
    
    print(f"  Extracted {len(features)} features ({error_count} errors)")
    
    # Build GeoJSON FeatureCollection
    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "name": layer_config["name"],
            "layerType": layer_config["layer_type"],
            "crs": "EPSG:2039",
            "featureCount": len(features),
            "extractedAt": datetime.now().isoformat(),
            "source": source
        }
    }
    
    # Write to file
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=None)
    
    file_size_mb = os.path.getsize(output_file) / (1024 * 1024)
    print(f"  Written: {output_file} ({file_size_mb:.2f} MB)")
    
    return {
        "file": output_file,
        "name": layer_config["name"],
        "layer_type": layer_config["layer_type"],
        "style": layer_config["style"],
        "feature_count": len(features),
        "size_mb": round(file_size_mb, 2)
    }


def main():
    """Main entry point."""
    # Parse output directory from args
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geojson_output")
    
    if len(sys.argv) > 2 and sys.argv[1] == "--output-dir":
        output_dir = sys.argv[2]
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    print("GIS Layer Import Script")
    print(f"Output directory: {output_dir}")
    print(f"Layers to process: {len(LAYERS)}")
    
    results = []
    
    for layer_config in LAYERS:
        result = extract_layer(layer_config, output_dir)
        if result:
            results.append(result)
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Successfully extracted: {len(results)}/{len(LAYERS)} layers")
    
    for r in results:
        print(f"  - {r['name']}: {r['feature_count']} features ({r['size_mb']} MB)")
    
    total_size = sum(r["size_mb"] for r in results)
    print(f"  Total size: {total_size:.2f} MB")
    
    # Write manifest
    manifest = {
        "extractedAt": datetime.now().isoformat(),
        "layers": results
    }
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    
    print(f"\nManifest written to: {manifest_path}")
    print("Use setup_layers.js to import these layers into the database.")


if __name__ == "__main__":
    main()
