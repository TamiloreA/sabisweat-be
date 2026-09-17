require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
async function test() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', '05c1bf78-5bab-482d-961e-35d41fa6e897');
  console.log(JSON.stringify(data, null, 2));
}
test();
