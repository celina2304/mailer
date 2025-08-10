const fs = require('fs');
const path = require('path');
const SibApiV3Sdk = require('@sendinblue/client');

// Helper to parse multipart form data
const busboy = require('busboy');

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Parse multipart form data
  const bb = busboy({ headers: req.headers });
  let fields = {};
  let attachments = [];
  let filePromises = [];

  bb.on('file', (name, file, info) => {
    const { filename, encoding, mimeType } = info;
    let fileBuffer = Buffer.alloc(0);
    file.on('data', (data) => {
      fileBuffer = Buffer.concat([fileBuffer, data]);
    });
    file.on('end', () => {
      attachments.push({
        content: fileBuffer.toString('base64'),
        name: filename,
      });
    });
  });

  bb.on('field', (name, val) => {
    fields[name] = val;
  });

  const finished = new Promise((resolve, reject) => {
    bb.on('finish', resolve);
    bb.on('error', reject);
  });

  req.pipe(bb);
  await finished;

  const { email, name, message, website } = fields;
  if (!email || !message || !name || !website) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Read and fill the HTML template
    const templatePath = path.join(process.cwd(), 'contact_email_template.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    htmlTemplate = htmlTemplate
      .replace(/\{\{website\}\}/g, website)
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{message\}\}/g, message);

    // Brevo setup
    const brevo = new SibApiV3Sdk.TransactionalEmailsApi();
    brevo.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

    await brevo.sendTransacEmail({
      sender: { email: process.env.FROM_EMAIL },
      to: [{ email: process.env.TO_EMAIL }],
      subject: `New message from ${website}`,
      htmlContent: htmlTemplate,
      attachment: attachments.length > 0 ? attachments : undefined,
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
}
