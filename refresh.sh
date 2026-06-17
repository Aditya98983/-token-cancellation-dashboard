#!/bin/bash
# Syncs latest requests from Slack channel into data.json
# Run this whenever you want to pull new requests: ./refresh.sh
# Or ask Claude: "sync my token cancellation dashboard"

cd "$(dirname "$0")"
echo "Refreshing dashboard data..."
echo "Run this inside Claude Code session:"
echo "  'sync the token cancellation dashboard from #mandate-token-cancellation-request'"
echo ""
echo "Or run Claude directly:"
echo "  claude 'Read Slack channel C08QR7PS3J8 and update ~/token-cancellation-dashboard/data.json with any new token cancellation requests'"
