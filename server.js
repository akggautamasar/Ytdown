import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Airdown backend is running 🚀' });
});

app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
  }

  try {
    const command = `yt-dlp --dump-json --no-warnings "${url}"`;
    const { stdout } = await execPromise(command, { maxBuffer: 1024 * 1024 * 20 });
    const info = JSON.parse(stdout);

    const formats = info.formats
      .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
      .map(f => ({
        format_id: f.format_id,
        quality: f.height ? `${f.height}p` : f.format_note || 'Unknown',
        ext: f.ext,
        filesize: f.filesize_approx ? Math.round(f.filesize_approx / 1024 / 1024) + ' MB' : 'Unknown',
      }))
      .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

    formats.unshift({
      format_id: 'bestaudio',
      quality: 'Audio Only (MP3)',
      ext: 'mp3',
      filesize: 'Varies'
    });

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration_string || 'Unknown',
      formats: formats.slice(0, 15)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch video info. Try again.' });
  }
});

app.get('/download', (req, res) => {
  const { url, format_id } = req.query;
  if (!url || !format_id) return res.status(400).send('Missing parameters');

  const safeTitle = 'Airdown_Video';
  let command = '';
  let contentType = 'video/mp4';
  let filename = `${safeTitle}.mp4`;

  if (format_id === 'bestaudio') {
    command = `yt-dlp -x --audio-format mp3 --no-warnings -o - "${url}"`;
    contentType = 'audio/mpeg';
    filename = `${safeTitle}.mp3`;
  } else {
    command = `yt-dlp -f "${format_id}+bestaudio/best" --merge-output-format mp4 --no-warnings -o - "${url}"`;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const proc = exec(command, { maxBuffer: 1024 * 1024 * 300 });
  proc.stdout.pipe(res);

  proc.on('error', () => {
    if (!res.headersSent) res.status(500).end('Download failed');
  });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
