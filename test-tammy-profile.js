require('dotenv').config();
const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: 'c76d11ef-3bd5-48f5-9c66-30dc5c435bdf' }, 'dummy_secret');

async function test() {
  const res = await fetch('https://sabisweat-be.onrender.com/api/v1/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
test();
