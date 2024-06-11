const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = 3000;

ffmpeg.setFfmpegPath(ffmpegPath);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
        <form action="/download" method="get">
            <input type="text" name="url" placeholder="Enter YouTube URL" required />
            <button type="submit">Download</button>
        </form>
    `);
});

app.get('/download', async (req, res) => {
    const url = req.query.url;
    if (!ytdl.validateURL(url)) {
        return res.status(400).send('Invalid URL');
    }

    try {
        const info = await ytdl.getInfo(url);
        const videoFormat = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
        const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

        const videoStream = ytdl(url, { format: videoFormat });
        const audioStream = ytdl(url, { format: audioFormat });

        const tempVideoPath = path.resolve(__dirname, 'temp_video.mp4');
        const tempAudioPath = path.resolve(__dirname, 'temp_audio.mp4');
        const outputPath = path.resolve(__dirname, 'output_video.mp4');

        // Save video and audio streams to temporary files
        await Promise.all([
            new Promise((resolve, reject) => {
                const videoFile = fs.createWriteStream(tempVideoPath);
                videoStream.pipe(videoFile);
                videoFile.on('finish', resolve);
                videoFile.on('error', reject);
            }),
            new Promise((resolve, reject) => {
                const audioFile = fs.createWriteStream(tempAudioPath);
                audioStream.pipe(audioFile);
                audioFile.on('finish', resolve);
                audioFile.on('error', reject);
            }),
        ]);

        // Merge video and audio using ffmpeg
        ffmpeg()
            .input(tempVideoPath)
            .input(tempAudioPath)
            .outputOptions('-c:v copy')
            .outputOptions('-c:a aac')
            .save(outputPath)
            .on('end', () => {
                res.download(outputPath, 'video.mp4', (err) => {
                    if (err) {
                        console.error('Error:', err);
                        res.status(500).send('Internal Server Error');
                    }
                    // Clean up temporary files
                    fs.unlinkSync(tempVideoPath);
                    fs.unlinkSync(tempAudioPath);
                    fs.unlinkSync(outputPath);
                });
            })
            .on('error', (error) => {
                console.error('Error:', error);
                res.status(500).send('Internal Server Error');
            });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
