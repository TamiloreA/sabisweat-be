require('dotenv').config();
const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: 'c76d11ef-3bd5-48f5-9c66-30dc5c435bdf' }, 'dummy_secret');

async function test() {
  const res = await fetch('https://sabisweat-be.onrender.com/api/v1/community/feeds', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Render Test Post',
      description: 'Testing which database Render writes to',
      tag: 'general'
    })
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text.substring(0, 200));
}
test();
