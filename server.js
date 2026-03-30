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

// Get video info with improved YouTube extraction
app.post('/info', async (req, res) => {
  const { url } = req.body;

  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
  }

  try {
    console.log('🔍 Fetching info for:', url);

    // Strong extractor args to work better with current YouTube
    const command = `yt-dlp --dump-json --no-warnings \
      --extractor-args "youtube:player_client=web,android,ios,web_embed,web_safari" \
      --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
      "${url}"`;

    const { stdout, stderr } = await execPromise(command, { 
      maxBuffer: 1024 * 1024 * 50 
    });

    if (stderr) console.log('yt-dlp stderr:', stderr);

    const info = JSON.parse(stdout);

    // Filter only formats with both video and audio
    const formats = info.formats
      .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
      .map(f => ({
        format_id: f.format_id,
        quality: f.height ? `${f.height}p` : (f.format_note || 'Unknown'),
        ext: f.ext,
        filesize: f.filesize_approx 
          ? Math.round(f.filesize_approx / (1024 * 1024)) + ' MB' 
          : 'Unknown'
      }))
      .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

    // Add Audio Only option
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
    console.error('Error message:', error.message);

    let errorMsg = 'Failed to fetch video. Try a different public video.';

    if (error.message.includes('Sign in') || error.message.includes('login') || error.message.includes('age')) {
      errorMsg = 'This video is age-restricted or requires login. Try a normal public video.';
    } else if (error.message.includes('private') || error.message.includes('unavailable') || error.message.includes('Video unavailable')) {
      errorMsg = 'This video is private, deleted, or unavailable.';
    } else if (error.message.includes('Unable to extract')) {
      errorMsg = 'YouTube changed something. Please try again later.';
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

  console.log('📥 Download requested for format:', format_id);

  let command = '';
  let contentType = 'video/mp4';
  let filename = `Airdown_Video_${Date.now()}.mp4`;

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
