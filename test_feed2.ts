import * as communityService from './src/services/communityService';

async function test() {
  try {
    const result = await communityService.getFeed(1, 10, '05c1bf78-5bab-482d-961e-35d41fa6e897');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
