#!/bin/bash
# ClickUp Voice Notification Hook
# Reads PostToolUse JSON from stdin, announces ClickUp operations via Windows TTS.
# Uses node for JSON parsing (jq not available).

INPUT=$(cat)

# Use node to parse stdin JSON and build the voice message
MSG=$(node -e "
const input = JSON.parse(process.argv[1]);
const toolName = input.tool_name || '';
const toolInput = input.tool_input || {};
const toolResponse = input.tool_response || {};
const action = toolName.replace('mcp__clickup__', '');

let msg = '';
switch (action) {
  case 'create_task': {
    const name = toolInput.name || 'unnamed';
    const id = (typeof toolResponse === 'object' && toolResponse.id) ? toolResponse.id : '';
    msg = 'ClickUp: Task created. ' + name + (id ? '. ID ' + id : '') + '.';
    break;
  }
  case 'update_task': {
    const taskId = toolInput.task_id || 'unknown';
    const status = toolInput.status || '';
    const name = toolInput.name || '';
    if (status) {
      msg = 'ClickUp: Task ' + taskId + ' status changed to ' + status + '.';
    } else if (name) {
      msg = 'ClickUp: Task ' + taskId + ' updated. Name: ' + name + '.';
    } else {
      msg = 'ClickUp: Task ' + taskId + ' updated.';
    }
    break;
  }
  case 'get_tasks': {
    let count = 0;
    try {
      if (typeof toolResponse === 'object' && Array.isArray(toolResponse.tasks)) {
        count = toolResponse.tasks.length;
      }
    } catch(e) {}
    msg = 'ClickUp: Retrieved ' + count + ' tasks.';
    break;
  }
  case 'create_list':
    msg = 'ClickUp: List created. ' + (toolInput.name || 'unnamed') + '.';
    break;
  case 'create_folder':
    msg = 'ClickUp: Folder created. ' + (toolInput.name || 'unnamed') + '.';
    break;
  default:
    msg = 'ClickUp: ' + action + ' completed.';
}
process.stdout.write(msg);
" "$INPUT" 2>/dev/null)

# Fallback if node parsing failed
if [ -z "$MSG" ]; then
  MSG="ClickUp tool used."
fi

# Log to file
LOG_DIR="$HOME/.claude"
LOG_FILE="$LOG_DIR/clickup-hook.log"
mkdir -p "$LOG_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${MSG}" >> "$LOG_FILE"

# Voice notification via PowerShell TTS (run in background to not block Claude)
# Sanitize message for PowerShell single-quote safety
SAFE_MSG=$(echo "$MSG" | sed "s/'/''/g")
powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Speech; [System.Speech.Synthesis.SpeechSynthesizer]::new().Speak('${SAFE_MSG}')" &

exit 0
