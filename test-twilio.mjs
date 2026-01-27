// Quick test script for Twilio credentials
import 'dotenv/config';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://eliza_dev:local_dev_password@localhost:5432/eliza_dev'
});

const ORG_ID = '4fee4051-4a8e-4d29-95ef-3605b60e234d';

// For local dev, master key defaults to all zeros if not set
const MASTER_KEY_HEX = process.env.SECRETS_MASTER_KEY || '0'.repeat(64);
const masterKey = Buffer.from(MASTER_KEY_HEX, 'hex');

// Decrypt the DEK first, then use it to decrypt the value
function decryptDek(encryptedDekBase64) {
  const data = Buffer.from(encryptedDekBase64, 'base64');
  const nonce = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function decrypt(encryptedValue, encryptedDek, nonce, authTag) {
  const dek = decryptDek(encryptedDek);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    dek,
    Buffer.from(nonce, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

async function main() {
  try {
    const result = await pool.query(
      'SELECT name, encrypted_value, encrypted_dek, nonce, auth_tag FROM secrets WHERE organization_id = $1 AND name LIKE $2',
      [ORG_ID, 'TWILIO%']
    );
    
    console.log('\n=== Twilio Credentials Check ===\n');
    
    const creds = {};
    for (const row of result.rows) {
      try {
        const value = decrypt(row.encrypted_value, row.encrypted_dek, row.nonce, row.auth_tag);
        creds[row.name] = value;
        
        if (row.name === 'TWILIO_ACCOUNT_SID') {
          console.log('Account SID:', value ? value.substring(0, 10) + '...' : 'EMPTY');
        } else if (row.name === 'TWILIO_AUTH_TOKEN') {
          console.log('Auth Token:', value ? '****' + value.slice(-4) : 'EMPTY');
        } else if (row.name === 'TWILIO_PHONE_NUMBER') {
          console.log('Phone Number:', value || 'EMPTY');
        }
      } catch (err) {
        console.error(`Failed to decrypt ${row.name}:`, err.message);
      }
    }
    
    // Test Twilio API
    if (creds.TWILIO_ACCOUNT_SID && creds.TWILIO_AUTH_TOKEN) {
      console.log('\n=== Testing Twilio API ===\n');
      
      const auth = Buffer.from(`${creds.TWILIO_ACCOUNT_SID}:${creds.TWILIO_AUTH_TOKEN}`).toString('base64');
      
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${creds.TWILIO_ACCOUNT_SID}.json`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      if (response.ok) {
        const account = await response.json();
        console.log('✅ Twilio credentials VALID');
        console.log('Account Name:', account.friendly_name);
        console.log('Account Status:', account.status);
        
        // Try to send a test message
        if (creds.TWILIO_PHONE_NUMBER) {
          const toNumber = process.argv[2];
          if (toNumber) {
            console.log('\n=== Sending Test SMS ===');
            console.log('From:', creds.TWILIO_PHONE_NUMBER);
            console.log('To:', toNumber);
            
            const msgResponse = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${creds.TWILIO_ACCOUNT_SID}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                  To: toNumber,
                  From: creds.TWILIO_PHONE_NUMBER,
                  Body: '🎉 Test message from Eliza Cloud! Your Twilio integration is working.'
                }).toString()
              }
            );
            
            if (msgResponse.ok) {
              const msg = await msgResponse.json();
              console.log('✅ Message sent successfully!');
              console.log('Message SID:', msg.sid);
              console.log('Status:', msg.status);
            } else {
              console.log('❌ Failed to send message');
              console.log('Status:', msgResponse.status);
              const errText = await msgResponse.text();
              console.log('Error:', errText);
            }
          } else {
            console.log('\n=== Ready to Send Test SMS ===');
            console.log('From:', creds.TWILIO_PHONE_NUMBER);
            console.log('Run: node test-twilio.mjs +1XXXXXXXXXX');
          }
        }
      } else {
        console.log('❌ Twilio credentials INVALID');
        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Error:', text);
      }
    } else {
      console.log('\n❌ Missing required Twilio credentials');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
