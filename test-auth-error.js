require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
// using PUBLISHABLE_KEY which is anon key
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
async function test() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', '05c1bf78-5bab-482d-961e-35d41fa6e897')
    .single();
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
