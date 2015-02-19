var fr;
var initUploader = function() {
	var message = document.getElementById('msg');
	var stats = document.getElementById('stats');
	/*
	* Initialize FileRun
	*/
	fr = new FileRun({
		target: 'http://127.0.0.1/proiecte/filerun/filerun.js/example/example.php', //URL where the files are being sent
		startOnSubmit: true, //automatically start transfer when files are being selected or dropped
		chunkSize: 12500, //split larger files in chunks of maximum 1MB. Adjust this value depending on your server limits.
		validateGetOffsetResponse: function (file, status, message) {
			if (status == 200) {
				try {
					var rs = eval('(function(){return' + message + ';})()');
				} catch (er) {
					return false;
				}
				if (rs && rs.success) {
					if (rs.offset) {
						rs.offset = parseInt(rs.offset);
						if (!isNaN(rs.offset) && isFinite(rs.offset)) {
							file.offset = rs.offset;
						}
					}
					return true;
				}
			}
		}, validateGetOffsetResponseScope: this,
		validateChunkResponse: function (status, message) {
			if (status != '200') {
				return 'retry';
			}
			try {
				var rs = eval('(function(){return' + message + ';})()');
			} catch (er) {
				return 'retry';
			}
			if (rs) {
				if (rs.success) {
					return 'success';
				} else {
					return 'error';
				}
			}
		}, validateChunkResponseScope: this
	});


	/*
	* Events listeners, used only for providing feedback to the user
	*/
	fr.on('filesSubmitted', function () {
		message.innerHTML += '<br>Transfer starting...';
	});
	fr.on('progress', function (fr) {
		var p = fr.getProgress();
		p = Math.round(p*100);
		stats.innerHTML = 'Percentage:' + p + '%'+
			'<br> Bytes completed: '+ fr.completedBytes+
			'<br> Bytes total: '+fr.size+
			'<br> Number of files actively transferring: '+fr.uploadingFiles+
			'<br> Number of files in the queue: '+fr.files.length
			;
	});
	fr.on('fileProgress', function (fr) {
		//this function gets called while one file is being transferred
		//and can be used to display statistic related to particular files in the queue
	});
	fr.on('fileSuccess', function (file, msg) {
		try {
			var rs = eval('(function(){return' + msg + ';})()');
			if (rs.success) {
				message.innerHTML += '<br>File transferred successfully: ' + rs.msg;
			}
		} catch (er) {
			message.innerHTML += '<br>Unexpected server reply: ' + msg;
		}
	});
	fr.on('fileError', function (file, msg) {
		try {
			var rs = eval('(function(){return' + msg + ';})()');
		} catch (er) {
			message.innerHTML += '<br>Unexpected server reply: ' + msg;
		}
		if (rs && rs.msg) {
			message.innerHTML += rs.msg;
		}
	});
	fr.on('fileAdded', function (file, event) {
		message.innerHTML += '<br>File added to queue: '+file.name;
	});
	fr.on('complete', function () {
		message.innerHTML += '<br>Transfer queue completed.';
	});

	/*
	*
	* Make the page body the target area for dropping files
	*
	* */
	FileRunUtils.attachDrop({
		domNode: document.body,
		onDragOver: function(e) {
			document.body.style.backgroundColor = 'yellow';
		},
		onDragLeave:  function(e) {
			document.body.style.backgroundColor = 'white';
		},
		onDrop: function (e) {
			document.body.style.backgroundColor = 'white';
			message.innerHTML += '<br>Files have been dropped on this page.';
			fr.onDrop(e);
		}, scope: window
	});
};