const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_API_URL = 'https://api.paystack.co';

// Initialize Paystack payment
async function initializePayment(email, amount, reference, metadata = {}) {
  try {
    const response = await axios.post(
      `${PAYSTACK_API_URL}/transaction/initialize`,
      {
        email,
        amount: amount * 100, // Convert to kobo (smallest currency unit)
        reference,
        metadata,
        callback_url: `${process.env.CALLBACK_URL || 'http://localhost:3000'}/payment/callback`
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      authorization_url: response.data.data.authorization_url,
      access_code: response.data.data.access_code,
      reference: response.data.data.reference
    };
  } catch (error) {
    console.error('Paystack initialization error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || 'Payment initialization failed'
    };
  }
}

// Verify Paystack payment
async function verifyPayment(reference) {
  try {
    const response = await axios.get(
      `${PAYSTACK_API_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data.data;
    return {
      success: data.status === 'success',
      amount: data.amount / 100, // Convert back from kobo
      reference: data.reference,
      email: data.customer.email,
      metadata: data.metadata,
      status: data.status
    };
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || 'Payment verification failed'
    };
  }
}

// Generate unique reference
function generateReference() {
  return `REF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  initializePayment,
  verifyPayment,
  generateReference,
  PAYSTACK_PUBLIC_KEY
};

