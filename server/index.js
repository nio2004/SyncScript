const express = require('express');
const multer = require('multer');
const fluentFfmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;  // Add this line

// Initialize express app
const app = express();
const port = 3000;

// Set up file upload using multer
const upload = multer({ dest: 'uploads/' });

// Set ffmpeg and ffprobe paths correctly
fluentFfmpeg.setFfmpegPath(ffmpegPath);
fluentFfmpeg.setFfprobePath(ffprobePath);  // Use ffprobe-static path

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Route to handle video and subtitle file uploads
app.post('/upload', upload.fields([{ name: 'video' }, { name: 'subtitle' }]), (req, res) => {
    if (!req.files || !req.files.video || !req.files.subtitle) {
        return res.status(400).json({ error: 'Both video and subtitle files are required' });
    }

    const videoFile = req.files.video[0];
    const subtitleFile = req.files.subtitle[0];

    // Determine subtitle file format (SRT or VTT)
    const subtitleFormat = path.extname(subtitleFile.originalname).toLowerCase();

    // Convert subtitle to VTT if necessary
    const subtitleOutputPath = path.join('uploads', `${path.basename(subtitleFile.originalname, subtitleFormat)}.vtt`);
    
    try {
        if (subtitleFormat === '.srt') {
            convertSrtToVtt(subtitleFile.path, subtitleOutputPath, () => {
                processSubtitleSync(videoFile, subtitleOutputPath, res);
            });
        } else if (subtitleFormat === '.vtt') {
            processSubtitleSync(videoFile, subtitleFile.path, res);
        } else {
            return res.status(400).json({ error: 'Unsupported subtitle format. Please upload an SRT or VTT file.' });
        }
    } catch (error) {
        console.error('Error processing files:', error);
        return res.status(500).json({ error: 'Error processing files', details: error.message });
    }
});

// Function to convert SRT to VTT
const convertSrtToVtt = (srtFilePath, vttFilePath, callback) => {
    try {
        const srtData = fs.readFileSync(srtFilePath, 'utf8');
        const vttHeader = 'WEBVTT\n\n';
        const vttData = srtData
            .replace(/\r/g, '')
            .replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4')
            .replace(/\n/g, '\n\n');

        fs.writeFileSync(vttFilePath, vttHeader + vttData);
        callback();
    } catch (error) {
        console.error('Error converting SRT to VTT:', error);
        throw error;
    }
};

// Function to sync subtitle with video
const processSubtitleSync = (videoFile, subtitleFilePath, res) => {
    const videoFilePath = videoFile.path;
    console.log(`Processing video: ${videoFilePath}`);

    fluentFfmpeg.ffprobe(videoFilePath, (err, metadata) => {
        if (err) {
            console.error('FFprobe error:', err);
            return res.status(500).json({ error: 'Error analyzing video file', details: err.message });
        }

        try {
            const videoDuration = metadata.format.duration;
            console.log(`Video duration: ${videoDuration} seconds`);

            // Send the processed subtitle file
            res.download(subtitleFilePath, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    return res.status(500).json({ error: 'Error sending subtitle file' });
                }

                // Clean up files after successful download
                setTimeout(() => {
                    try {
                        if (fs.existsSync(videoFilePath)) fs.unlinkSync(videoFilePath);
                        if (fs.existsSync(subtitleFilePath)) fs.unlinkSync(subtitleFilePath);
                    } catch (error) {
                        console.error('Error cleaning up files:', error);
                    }
                }, 1000);
            });
        } catch (error) {
            console.error('Error processing video:', error);
            return res.status(500).json({ error: 'Error processing video', details: error.message });
        }
    });
};

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});