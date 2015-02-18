# filerun.js
A JavaScript library providing reliable uploads via the HTML5 File API.

The library is designed to introduce fault-tolerance into the upload of large files through HTTP. This is done by splitting each file into small chunks. Then, whenever the upload of a chunk fails, uploading is retried until the procedure completes. This allows uploads to automatically resume uploading after a network connection is lost either locally or to the server. Additionally, it allows for users to pause, resume and even recover uploads without losing state because only the currently uploading chunks will be aborted, not the entire upload.

filerun.js does not have any external dependencies other than the HTML5 File API.

## Features

- Multiple simultaneous file uploads
- Chunked transfers for resumable uploads
- Auto-retries when interrupted
- The upload queue can be paused and even individual files can be paused
- Low browser memory usage, to allow hundreds of files to be uploaded in the same session
- Uploads folders on Chrome
- Shows statistics about the total progress and for individual files, including the transfer rate/speed

## Demo

This JavaScript library has been developed as part of FileRun, a PHP file manager. You can try the demo here: http://www.filerun.com/demo
It allows you to upload an unlimited number of files, of unlimited sizes. You get to see "filerun.js" in action, with a full-featured user interface.

## Usage

See the "/example" folder. Edit "example.js" to set the URL of the server-side upload script. Use the included "example.php" to see how to handle the uploads on the server.

## Credits
filerun.js has been developed based on https://github.com/flowjs/flow.js which in its turn was inspired by  https://github.com/23/resumable.js
