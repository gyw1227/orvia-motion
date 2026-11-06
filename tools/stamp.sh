#!/bin/sh
# Give index.html fresh asset URLs so Safari never mixes an old script with a new page.
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(href=\"styles\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(src=\"live\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(src=\"app\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#" index.html
echo "$V"
