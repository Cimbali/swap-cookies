#!/bin/bash

files=$(git ls-files | grep -vEx '[A-Z]+(\.md)?|.+\.sh|\.git.*|deps/.*' | paste -sd ' ')

for mindep in publicsuffixlist punycode;
do
	cp -u deps/${mindep}/${mindep}.min.js ./
	files+=" ${mindep}.min.js"
done

zip -r -FS swap_cookies.zip $files
