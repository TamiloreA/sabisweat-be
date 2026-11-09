const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdminUser(email, password, firstName = 'Admin', lastName = 'User') {
  if (!email || !password) {
    console.error('Usage: node scripts/create_admin.js <email> <password> [firstName] [lastName]');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();

  console.log(`Creating user in Supabase Auth: ${normalizedEmail}...`);

  // 1. Create or update user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    app_metadata: {
      role: 'admin',
      is_admin: true,
      claims_admin: true,
    },
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      is_admin: true,
      role: 'admin',
    },
  });

  let userId;

  if (authError) {
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      console.log('User already exists in Supabase Auth. Updating password and metadata...');
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existingUser = listData?.users?.find(u => u.email?.toLowerCase().trim() === normalizedEmail);
      if (!existingUser) {
        console.error('Could not locate existing user ID.');
        process.exit(1);
      }
      userId = existingUser.id;
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        app_metadata: {
          ...existingUser.app_metadata,
          role: 'admin',
          is_admin: true,
          claims_admin: true,
        },
        user_metadata: {
          ...existingUser.user_metadata,
          first_name: firstName,
          last_name: lastName,
          is_admin: true,
          role: 'admin',
        },
      });
      if (updateError) {
        console.error('Failed to update existing user:', updateError.message);
        process.exit(1);
      }
      console.log('Password updated successfully for existing user.');
    } else {
      console.error('Error creating user:', authError.message);
      process.exit(1);
    }
  } else {
    userId = authData.user.id;
    console.log(`Created auth user with ID: ${userId}`);
  }

  // 2. Ensure profile exists in public.profiles
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email: normalizedEmail,
    first_name: firstName,
    last_name: lastName,
    username: normalizedEmail.split('@')[0],
    has_password: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (profileError) {
    console.warn('Note: Profile upsert warning (may already exist):', profileError.message);
  } else {
    console.log('Profile synced in public.profiles.');
  }

  console.log('\n===========================================');
  console.log('✅ Admin Account Ready!');
  console.log(`Email:    ${normalizedEmail}`);
  console.log(`Password: ${password}`);
  console.log('You can now log into the admin dashboard at:');
  console.log('http://localhost:5173 (or your deployed admin URL)');
  console.log('===========================================\n');
}

const args = process.argv.slice(2);
createAdminUser(args[0], args[1], args[2], args[3]).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

