# imager
Traverses source directory and copies all images and creates a thumbnail and saves path to elastic.
Makes use of queues to not stress out OS with too many running child processes.

This script can also be used to query elastic for all tags and add all those tags to the mysql db.

Dependencies:
- ImageMagick 7.0.8 or GraphicsMagick
- MariaDB
- Elastic search 7.4

sudo apt-get install -y graphicsmagick

Instructions:

npm install -g ts-node
npm install

npm run build
npm start

Note: If you are getting ECONNRESET while running on large src folders, then increase the timeout limit of your
mariadb/mysql db. 

Run:

#Command to add images. 
node lib/index.js -src /mysrcfolder -dest /mydestfolder

#Command to update mysql with all the elastic tags for all images
node lib/index.js -t

