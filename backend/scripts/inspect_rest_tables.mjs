const url = 'https://hrms.businz.com';
const key = 'vps-local-rest-key';
async function run() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  console.log('Status:', res.status);
  const spec = await res.json();
  console.log('Expenses table definitions:');
  console.log(JSON.stringify(spec.definitions?.expenses, null, 2));
}
run();
