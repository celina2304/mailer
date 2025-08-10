// This file is no longer used for Vercel deployment.
// Backend logic has been moved to api/send-mail.js as a Vercel serverless function.
// You may use this file for local development only.
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const SibApiV3Sdk = require("@sendinblue/client");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Brevo setup
const brevo = new SibApiV3Sdk.TransactionalEmailsApi();
brevo.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

// Contact form endpoint with file support
app.post("/send-mail", upload.array("file", 5), async (req, res) => {
  const { email, name, message, website } = req.body;
  const files = req.files;

  if (!email || !message || !name || !website) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Read files as Base64 (Brevo needs base64 attachments)
    let attachments = [];
    if (files && files.length > 0) {
      attachments = files.map(file => ({
        content: fs.readFileSync(file.path).toString("base64"),
        name: file.originalname,
      }));
    }

    // Read and fill the HTML template
    const templatePath = path.join(__dirname, "contact_email_template.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf8");
    htmlTemplate = htmlTemplate
      .replace(/\{\{website\}\}/g, website)
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{message\}\}/g, message);

    await brevo.sendTransacEmail({
      sender: { email: process.env.FROM_EMAIL },
      to: [{ email: process.env.TO_EMAIL }],
      subject: `New message from ${website}`,
      htmlContent: htmlTemplate,
      attachment: attachments.length > 0 ? attachments : undefined,
    });

    // Clean up files
    if (files && files.length > 0) {
      files.forEach(file => fs.unlinkSync(file.path));
    }

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Mailer API running at http://localhost:${process.env.PORT}`);
});
