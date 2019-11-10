# imager
Traverses source directory and copies all images and creates a thumbnail and saves path to db.
Makes use of queues to not stress out OS with too many running child processes.

Dependencies:
- ImageMagick 7.0.8

Instructions:

npm install -g ts-node
npm install

npm run build
npm start


TODO: 
- gracefully close mysql db connection.
