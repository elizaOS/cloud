#!/bin/bash

# Incremental merge script - merges commits from main one at a time
# Stops on conflicts so you can review and resolve

set -e

MERGE_BASE="fea70b91abc9fb61d67085146ef0eb0ad56c01fb"
TARGET_BRANCH="origin/main"
STATE_FILE=".incremental-merge-state"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get all commits from merge-base to target (oldest first)
get_commits() {
    git rev-list --reverse "$MERGE_BASE".."$TARGET_BRANCH"
}

# Get commit info
get_commit_info() {
    local sha=$1
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Commit:${NC} $sha"
    echo -e "${YELLOW}Author:${NC} $(git log -1 --format='%an <%ae>' $sha)"
    echo -e "${YELLOW}Date:${NC}   $(git log -1 --format='%ci' $sha)"
    echo -e "${YELLOW}Title:${NC}  $(git log -1 --format='%s' $sha)"
    echo ""
    echo -e "${YELLOW}Full message:${NC}"
    git log -1 --format='%b' $sha | head -20
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Show files changed in commit
show_changed_files() {
    local sha=$1
    echo -e "${YELLOW}Files changed in this commit:${NC}"
    git diff-tree --no-commit-id --name-status -r $sha | head -30
    local count=$(git diff-tree --no-commit-id --name-only -r $sha | wc -l | tr -d ' ')
    if [ "$count" -gt 30 ]; then
        echo "... and $((count - 30)) more files"
    fi
}

# Save current state
save_state() {
    local current_idx=$1
    local total=$2
    echo "$current_idx $total" > "$STATE_FILE"
}

# Load state
load_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo "0 0"
    fi
}

# Show conflict details
show_conflicts() {
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                         MERGE CONFLICT DETECTED                        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Conflicting files:${NC}"
    git diff --name-only --diff-filter=U
    echo ""
    echo -e "${YELLOW}To resolve:${NC}"
    echo "  1. Edit the conflicting files to resolve conflicts"
    echo "  2. Run: git add <files>"
    echo "  3. Run: git commit (commit message will be auto-generated)"
    echo "  4. Run: ./scripts/incremental-merge.sh continue"
    echo ""
    echo -e "${YELLOW}To see conflict details:${NC}"
    echo "  git diff"
    echo ""
    echo -e "${YELLOW}To abort this merge:${NC}"
    echo "  git merge --abort"
    echo ""
}

# Main merge loop
do_merge() {
    local start_idx=${1:-0}
    
    # Get all commits
    local commits=($(get_commits))
    local total=${#commits[@]}
    
    echo -e "${GREEN}Starting incremental merge from main${NC}"
    echo -e "Total commits to merge: ${YELLOW}$total${NC}"
    echo -e "Starting from commit: ${YELLOW}$((start_idx + 1))${NC}"
    echo ""
    
    for ((i=start_idx; i<total; i++)); do
        local sha="${commits[$i]}"
        local progress="[$((i + 1))/$total]"
        
        echo ""
        echo -e "${GREEN}$progress Attempting to merge...${NC}"
        get_commit_info "$sha"
        show_changed_files "$sha"
        echo ""
        
        # Try to merge
        if git merge --no-edit "$sha" 2>/dev/null; then
            echo -e "${GREEN}✓ Merged successfully!${NC}"
            save_state "$((i + 1))" "$total"
        else
            # Check if it's a conflict or other error
            if git diff --name-only --diff-filter=U | grep -q .; then
                save_state "$i" "$total"
                show_conflicts
                exit 1
            else
                echo -e "${RED}Merge failed for unknown reason. Check git status.${NC}"
                save_state "$i" "$total"
                exit 1
            fi
        fi
    done
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    ALL COMMITS MERGED SUCCESSFULLY!                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    rm -f "$STATE_FILE"
}

# Continue after conflict resolution
do_continue() {
    # Check if there's an ongoing merge
    if [ -f .git/MERGE_HEAD ]; then
        echo -e "${YELLOW}Completing the current merge...${NC}"
        if ! git commit --no-edit 2>/dev/null; then
            echo -e "${RED}Failed to commit. Make sure all conflicts are resolved and files are staged.${NC}"
            exit 1
        fi
    fi
    
    local state=($(load_state))
    local start_idx=$((state[0] + 1))
    
    if [ "$start_idx" -eq "1" ] && [ ! -f "$STATE_FILE" ]; then
        echo -e "${YELLOW}No incremental merge in progress. Starting fresh...${NC}"
        start_idx=0
    fi
    
    do_merge "$start_idx"
}

# Show status
do_status() {
    local commits=($(get_commits))
    local total=${#commits[@]}
    
    if [ -f "$STATE_FILE" ]; then
        local state=($(load_state))
        local current=${state[0]}
        echo -e "Incremental merge in progress"
        echo -e "Progress: ${YELLOW}$current / $total${NC} commits"
        echo -e "Remaining: ${YELLOW}$((total - current))${NC} commits"
        
        if [ -f .git/MERGE_HEAD ]; then
            echo ""
            echo -e "${RED}There is an unresolved merge conflict!${NC}"
            echo -e "Conflicting files:"
            git diff --name-only --diff-filter=U
        fi
    else
        echo -e "No incremental merge in progress"
        echo -e "Commits to merge: ${YELLOW}$total${NC}"
    fi
}

# Reset/abort
do_reset() {
    if [ -f .git/MERGE_HEAD ]; then
        git merge --abort
    fi
    rm -f "$STATE_FILE"
    echo -e "${GREEN}Incremental merge state reset${NC}"
}

# Skip current commit
do_skip() {
    if [ -f .git/MERGE_HEAD ]; then
        git merge --abort
    fi
    
    local state=($(load_state))
    local current=${state[0]}
    save_state "$((current + 1))" "${state[1]}"
    echo -e "${YELLOW}Skipped commit. Run 'continue' to proceed.${NC}"
}

# Main command handler
case "${1:-start}" in
    start)
        do_merge 0
        ;;
    continue)
        do_continue
        ;;
    status)
        do_status
        ;;
    reset)
        do_reset
        ;;
    skip)
        do_skip
        ;;
    *)
        echo "Usage: $0 {start|continue|status|reset|skip}"
        echo ""
        echo "Commands:"
        echo "  start     - Begin incremental merge from the beginning"
        echo "  continue  - Continue after resolving conflicts"
        echo "  status    - Show current merge progress"
        echo "  reset     - Abort and reset merge state"
        echo "  skip      - Skip the current conflicting commit"
        exit 1
        ;;
esac

