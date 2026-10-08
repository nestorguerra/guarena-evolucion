#!/bin/sh
# The game as it was at a commit, served beside the current one for ab.py: .snaps/antes/ (out of the repository) holds
# that commit's index.html and src/, and links to today's data/, assets/ and tools/ (perflab.js and playtest.js drive
# both alike). With the dev server on 8918: http://localhost:8918/.snaps/antes/index.html
#   sh tools/perf/antes.sh [COMMIT]   (default: HEAD)
set -e
cd "$(dirname "$0")/../.."
C="${1:-HEAD}"
rm -rf .snaps/antes && mkdir -p .snaps/antes
git show "$C:index.html" > .snaps/antes/index.html
git archive "$C" src | tar -x -C .snaps/antes
ln -s ../../data .snaps/antes/data && ln -s ../../assets .snaps/antes/assets && ln -s ../../tools .snaps/antes/tools
echo ".snaps/antes: $(git rev-parse --short "$C")"
