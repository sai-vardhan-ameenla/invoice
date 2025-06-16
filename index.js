const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

admin.initializeApp();

const gmailEmail = functions.config().gmail.email;
const gmailPassword = functions.config().gmail.password;
const twilioSid = functions.config().twilio.sid;
const twilioToken = functions.config().twilio.token;
const twilioWhatsApp = functions.config().twilio.whatsapp;

// Configure Nodemailer transport
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

// Configure Twilio client
const twilioClient = twilio(twilioSid, twilioToken);

exports.sendInvoice = functions.https.onCall(async (data, context) => {
  console.log('sendInvoice function invoked with data:', data);
  const { invoiceId, invoiceNo, customerName, pdfBase64, email, whatsappNumber, timestamp } = data;

  if (!invoiceId || !invoiceNo || !pdfBase64 || !email || !whatsappNumber || !timestamp) {
    console.error('Missing required fields:', { invoiceId, invoiceNo, pdfBase64, email, whatsappNumber, timestamp });
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Upload PDF to Firebase Storage
    console.log('Uploading PDF to Firebase Storage...');
    const bucket = admin.storage().bucket();
    const file = bucket.file(`invoices/${invoiceId}.pdf`);
    await file.save(Buffer.from(pdfBase64, 'base64'), {
      metadata: { contentType: 'application/pdf' },
    });
    await file.makePublic();
    const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/invoices%2F${invoiceId}.pdf?alt=media`;
    console.log('PDF uploaded successfully, URL:', pdfUrl);

    // Prepare email
    const mailOptions = {
      from: gmailEmail,
      to: email,
      subject: `Invoice ${invoiceNo} from Tripzetta`,
      text: `Dear ${customerName || 'Customer'},\n\nPlease find attached the invoice ${invoiceNo}.\nGenerated on: ${timestamp}\n\nBest regards,\nTripzetta Team`,
      attachments: [
        {
          filename: `Invoice_${invoiceNo}.pdf`,
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    };

    // Send email
    console.log('Sending email to:', email);
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${email}`);

    // Send WhatsApp message
    console.log('Sending WhatsApp message to:', whatsappNumber);
    await twilioClient.messages.create({
      from: twilioWhatsApp,
      to: `whatsapp:+91${whatsappNumber}`,
      body: `Dear ${customerName || 'Customer'}, your invoice ${invoiceNo} has been generated on ${timestamp}. Please find it attached.`,
      mediaUrl: [pdfUrl],
    });
    console.log(`WhatsApp message sent successfully to +91${whatsappNumber}`);

    return { status: 'success', message: 'Invoice sent successfully' };
  } catch (error) {
    console.error('Error in sendInvoice:', error);
    throw new functions.https.HttpsError('internal', `Failed to send invoice: ${error.message}`);
  }
});