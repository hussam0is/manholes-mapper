// Legacy Import Loader
// Dynamically loads PapaParse and Wicket for the Import Wizard

import Papa from 'papaparse';
import Wkt from 'wicket';

window.Papa = Papa;
window.Wkt = Wkt;

console.log('Legacy Import Loader initialized. PapaParse and Wicket are available.');
