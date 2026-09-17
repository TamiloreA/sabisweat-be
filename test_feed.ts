import { supabase } from './src/config/database';

async function test() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(5);
    
  console.log(JSON.stringify(profiles, null, 2));
  console.log('Error:', error);
}

test();
