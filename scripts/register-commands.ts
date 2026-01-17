import 'dotenv/config';
import fetch from 'node-fetch';

const APPLICATION_ID = process.env.APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const commands = [
  {
    name: 'bundle',
    description: 'Lookup bundle info (Humble, Fanatical, GMG)',
    type: 1,
    options: [
      {
        name: 'store',
        description: 'Store name',
        type: 3,
        required: true,
        choices: [
          { name: 'Humble Bundle', value: 'humble' },
          { name: 'Fanatical', value: 'fanatical' },
          { name: 'Green Man Gaming', value: 'gmg' }
        ]
      },
      {
        name: 'id',
        description: 'Bundle slug or ID',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'channel',
    description: 'Admin notification management',
    type: 1,
    default_member_permissions: '8', // only admins
    options: [
      {
        name: 'add',
        description: 'Subscribe channel to notifications',
        type: 1,
        options: [
          { name: 'platforms', description: 'e.g. humble,fanatical (default: all)', type: 3, required: false },
          { name: 'channel', description: 'Target channel', type: 7, required: false }
        ]
      },
      {
        name: 'remove',
        description: 'Unsubscribe channel',
        type: 1,
        options: [
          { name: 'channel', description: 'Target channel', type: 7, required: false }
        ]
      },
      {
        name: 'list',
        description: 'List active subscriptions for this server',
        type: 1
      }
    ]
  },
  {
    name: 'db',
    description: '[SUPER ADMIN] Database operations',
    type: 1,
    default_member_permissions: '8',
    options: [
      {
        name: 'delete-bundle',
        description: 'Remove a bundle from DB',
        type: 1,
        options: [
          { name: 'store', description: 'Store', type: 3, required: true, choices: [{name:'Humble',value:'humble'}, {name:'Fanatical',value:'fanatical'}, {name:'GMG',value:'gmg'}] },
          { name: 'id', description: 'Bundle ID/Slug', type: 3, required: true }
        ]
      }
    ]
  }
];

async function register() {
  if (!APPLICATION_ID || !BOT_TOKEN) {
    console.error('❌ Missing APPLICATION_ID or DISCORD_BOT_TOKEN in .env');
    return;
  }
  
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (response.ok) {
    console.log('Commands Registered!');
  } else {
    const err = await response.json();
    console.error('Error:', JSON.stringify(err, null, 2));
  }
}

register();