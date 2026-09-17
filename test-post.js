require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
async function test() {
  const { data, error } = await supabase
    .from('community_posts')
    .select('id, author_id')
    .eq('id', 'e45fc9be-e66a-4f81-83bd-408364f28020');
  console.log(data);
}
test();
