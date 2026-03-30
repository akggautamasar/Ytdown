import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Airdown backend is running 🚀' });
});

// Get video info
app.post('/info', async (req, res) => {
  const { url } = req.body;

  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
  }

  try {
    console.log('🔍 Fetching info for:', url);

    // Improved command with better extractor args to work with current YouTube
    const command = `yt-dlp --dump-json --no-warnings \
      --extractor-args "youtube:player_client=web,android,ios,web_safari" \
      --user-agent "Mozilla/5.0" "${url}"`;

    const { stdout, stderr } = await execPromise(command, { 
      maxBuffer: 1024 * 1024 * 50 
    });

    if (stderr) console.log('yt-dlp warning:', stderr);

    const info = JSON.parse(stdout);

    // Filter formats that include both video + audio
    const formats = info.formats
      .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
      .map(f => ({
        format_id: f.format_id,
        quality: f.height ? `${f.height}p` : (f.format_note || f.resolution || 'Unknown'),
        ext: f.ext,
        filesize: f.filesize_approx 
          ? Math.round(f.filesize_approx / (1024 * 1024)) + ' MB' 
          : 'Unknown'
      }))
      .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

    // Add MP3 option
    formats.unshift({
      format_id: 'bestaudio',
      quality: 'Audio Only (MP3)',
      ext: 'mp3',
      filesize: 'Varies'
    });

    res.json({
      title: info.title || 'Unknown Title',
      thumbnail: info.thumbnail,
      duration: info.duration_string || 'Unknown',
      formats: formats.slice(0, 15)
    });

  } catch (error) {
    console.error('❌ Backend Error for URL:', url);
    console.error('Error:', error.message);

    let errorMsg = 'Failed to fetch video. Try again or use a different public video.';

    if (error.message.includes('Video unavailable') || error.message.includes('private video')) {
      errorMsg = 'This video is private, deleted, or unavailable.';
    } else if (error.message.includes('Sign in') || error.message.includes('login')) {
      errorMsg = 'This video requires login (age-restricted or members-only).';
    } else if (error.message.includes('Unable to extract')) {
      errorMsg = 'YouTube changed something. Backend is trying to update...';
    }

    res.status(500).json({ error: errorMsg });
  }
});

// Download endpoint
app.get('/download', (req, res) => {
  const { url, format_id } = req.query;

  if (!url || !format_id) {
    return res.status(400).send('Missing URL or format_id');
  }

  console.log('📥 Download requested:', format_id, 'for', url);

  let command = '';
  let contentType = 'video/mp4';
  let filename = `Airdown_${Date.now()}.mp4`;

  if (format_id === 'bestaudio') {
    command = `yt-dlp -x --audio-format mp3 --no-warnings -o - "${url}"`;
    contentType = 'audio/mpeg';
    filename = `Airdown_Audio_${Date.now()}.mp3`;
  } else {
    command = `yt-dlp -f "${format_id}+bestaudio/best" --merge-output-format mp4 --no-warnings -o - "${url}"`;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const proc = exec(command, { maxBuffer: 1024 * 1024 * 300 });

  proc.stdout.pipe(res);

  proc.on('error', (err) => {
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).end('Download failed');
  });
});

app.listen(PORT, () => {
  console.log(`✅ Airdown Backend running on port ${PORT}`);
});
