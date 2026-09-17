require('dotenv').config();
const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: '05c1bf78-5bab-482d-961e-35d41fa6e897' }, 'dummy_secret');

async function test() {
  const res = await fetch('https://sabisweat-be.onrender.com/api/v1/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
test();
