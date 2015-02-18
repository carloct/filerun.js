<?php

$uploadFile = $_FILES['file'];
$userRelativePath = $_REQUEST['frRelativePath'];
$getOffsetRequest = isset($_REQUEST['frGetOffset']);
$isFirstChunk = $_REQUEST['frIsFirstChunk'] == 1;
$isLastChunk = $_REQUEST['frIsLastChunk'] == 1;
$currentChunkSize = $uploadFile['size'];
$totalSize = $_REQUEST['frTotalSize'];
$tmpPath = $uploadFile['tmp_name'];


if (!$getOffsetRequest && !is_file($tmpPath)) {//Prevents Firefox from failing at uploading folders
	$error = 'Failed to transfer data. Make sure you are not trying to upload an empty folder.';
}

if (!$error) {

	if ($_REQUEST['frFilename']) {//some browsers do not send the file's name, so FileRun is including it as a POST variable
		$niceFilename = $_REQUEST['frFilename'];
	} else {
		$niceFilename = $uploadFile['name'];
	}

	if (!$error) {
		$tempFilePath = 'uploads/'.$niceFilename.'.'.$totalSize.'.upload';
		$finalPath = 'uploads/'.$niceFilename;
		$tempFileExists = is_file($tempFilePath);

		/*
		if (rand(0, 100) < 20) {//include 20% chance of failure
			echo 'random artificial error '.time();
			exit();
		}
		*/

		if ($getOffsetRequest) {
			if ($tempFileExists) {
				$output = array('success' => true, 'offset' => filesize($tempFilePath));//let FileRun know how much was already uploaded from the file
			} else {
				$output = array('success' => true);
			}
			echo json_encode($output);
			exit();
		}

		if (!$isFirstChunk && !$isLastChunk && !$tempFileExists) {
			exit('The file needs to be uploaded from the beginning.');
		}
	}
}

if (!$error) {
	if ($isFirstChunk && $isLastChunk) {
		$rs = move_uploaded_file($tmpPath, $finalPath);
		if (!$rs) {
			$error = "Failed to upload file in one chunk";
		} else {
			$message = 'File uploaded in one chunk';
		}
	} else {
		if ($isFirstChunk) {
			$rs = move_uploaded_file($tmpPath, $tempFilePath);
			if (!$rs) {
				$error = "Failed to upload file chunk: failed to create temporary file";
			}
		} else {
			if (!$tempFilePath) {
				$error = "Failed to upload chunk: missing temporary file";
			} else {
				$rs = glueFiles($tempFilePath, $tmpPath);
				if (!$rs) {
					$error = "Failed to glue chunks together";
				} else {
					if ($isLastChunk) {
						$rs = rename($tempFilePath, $finalPath);
						if (!$rs) {
							$error = "Failed to upload file, failed to rename";
						} else {
							$message = 'File '.$niceFilename.' successfully uploaded';
						}
					} else {
						$message = 'File chunk uploaded';
					}
				}
			}
		}
	}

	if (@is_file($tmpPath)) {
		@unlink($tmpPath);//remove temporary PHP data
	}
}

if ($error) {
	$output = array(
		"success" => false,
		"msg" => $error
	);
} else {
	$output = array(
		"success" => true,
		"msg" => $message
	);
}
echo json_encode($output);
exit();


function glueFiles($firstPath, $secondPath) {
	if (file_exists($firstPath)) {
		if (file_exists($secondPath)) {
			$src = fopen($secondPath, "rb");
			$trg = fopen($firstPath, "ab");
			if ($src) {
				if ($trg) {
					while (($buf = fread($src, 10485760)) != '') {
						$rs = fwrite($trg, $buf);
						unset($buf);
						if (!$rs) {
							$this->errorMsg = "glueFiles error: Unable to write to file.";
							break;
						}
					}
					fclose($trg);
					fclose($src);
					return true;
				} else {
					$this->errorMsg = "glueFiles error: Unable to open target file for appending.";
					return false;
				}
			} else {
				$this->errorMsg = "glueFiles error: Unable to open source file for reading.";
				return false;
			}
		} else {
			$this->errorMsg = "glueFiles error: File \"".$secondPath."\" doesn't exist.";
			return false;
		}
	} else {
		$this->errorMsg = "glueFiles error: File \"".$firstPath."\" doesn't exist.";
		return false;
	}
}