#!/bin/bash

for fontName in `ls public/fonts | grep ttf`; do
#	echo "@font-face {"
  echo "font-family: $fontName;" | sed "s/\.otf//" | sed "s/\.ttf//"
#  echo "src: url(/fonts/$fontName);"
#  echo "}"
done

