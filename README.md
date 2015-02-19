# filerun.js
"filerun.js" is a JavaScript library which provides reliable HTTP file uploads.

The library is designed to introduce fault-tolerance. This is done by splitting larger files into smaller chunks. Then, whenever the upload of a chunk fails, uploading is automatically retried until the procedure completes. This allows uploads to automatically resume uploading after a network connection is lost either locally or to the server. Additionally, it allows for users to pause, resume and even recover uploads without losing state because only the currently uploading chunks will be aborted, not the entire upload.

filerun.js does not have any external dependencies other than the HTML5 File API.

## Features

- Multiple simultaneous file uploads
- Chunked transfers for resumable uploads
- Auto-retries when interrupted
- The upload queue can be paused and even individual files can be paused
- Low browser memory usage, to allow hundreds of files to be uploaded in the same session
- Uploads folders on Chrome
- Shows statistics about the total progress and for individual files, including the transfer rate/speed
- Standalone, requires no other JavaScript component or library.
- Only 14 KB (minified, before gzip compression)

### Differences between filerun.js and other libraries

- Large files are split in chunks which are uploaded in a proper order, so you don't have to keep multiple temporary files on the server until the file is completed.
- You have full control over error handling and user feedback. You decide what means a successful upload, as other libraries consider a successfull request one which returns a HTTP status of 200.
- Low browser memory usage and fast progress report. Supports transferring hundreds of files in one drop and the browser will not choke.
- It uploads also empty files. (Yes, it's useful in many cases.)
- You get to decide how large is a file that needs to be uploaded in chunks; smaller files being uploaded in one go.
- You get to decide how many files should be uploaded simulatenously. My tests show that is not useful to upload more than a couple at a time.
- The entire queue can be paused, or only certain files can be paused, skipped or removed from the queue. Additional files can be added to the queue, even while uploads are in progress. This allows FTP-client-like queue management.

## Demo

This JavaScript library has been developed as part of FileRun, a PHP file manager. You can try the demo here: http://www.filerun.com/demo
It allows you to upload an unlimited number of files, of unlimited sizes. You get to see "filerun.js" in action, with a full-featured user interface.

## Usage

See the "/example" folder. Edit "example.js" to set the URL of the server-side upload script. Use the included "example.php" to see how to handle the uploads on the server.

## Credits
filerun.js has been developed based on https://github.com/flowjs/flow.js which in its turn was inspired by  https://github.com/23/resumable.js
