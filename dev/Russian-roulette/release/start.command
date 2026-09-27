#!/bin/sh
cd "$(dirname "$0")" || exit 1
sh start.sh
printf '\nPress Enter to close / Натиснете Enter за затваряне\n'
read -r answer
