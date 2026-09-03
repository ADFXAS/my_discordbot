require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require('discord.js');

if (!process.env.DISCORD_TOKEN) {
  throw new Error('ضع DISCORD_TOKEN داخل ملف .env');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ALLOWED_USERS = [
  '1518574556787249177',
  '1496923040985124905',
  '1422526730035396659'
];

const dataFile = path.join(__dirname, 'noback.json');
let noBackList = new Set();
let isNoBackEnabled = true;

try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const users = Array.isArray(data) ? data : data.users;

    if (Array.isArray(users)) {
      noBackList = new Set(users);
    }

    if (!Array.isArray(data) && typeof data.enabled === 'boolean') {
      isNoBackEnabled = data.enabled;
    }
  }
} catch (error) {
  console.error('تعذر تحميل بيانات النوباك:', error);
}

function saveData() {
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        enabled: isNoBackEnabled,
        users: [...noBackList]
      },
      null,
      2
    ),
    'utf8'
  );
}

function isAllowed(message) {
  return (
    ALLOWED_USERS.includes(message.author.id) ||
    message.member?.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

client.once('clientReady', () => {
  console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);
});

// هذا هو المستمع الوحيد لأوامر المستخدمين
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (command !== '!noback' && command !== '!noback_protection') {
    return;
  }

  if (!isAllowed(message)) {
    return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
  }

  if (command === '!noback') {
    const action = args[1]?.toLowerCase();

    if (action === 'list') {
      if (noBackList.size === 0) {
        return message.reply(
          ':clipboard: قائمة النوباك فارغة حالياً.'
        );
      }

      const list = [...noBackList]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return message.reply(
        `📋 **قائمة المحظورين نوباك (${noBackList.size}):**\n${list}`
      );
    }

    if (action === 'removed') {
      const userId = args[2];

      if (!/^\d+$/.test(userId || '')) {
        return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
      }

      if (!noBackList.has(userId)) {
        return message.reply(':warning: غلطان يالاخو.');
      }

      noBackList.delete(userId);
      saveData();
      return message.reply(
        `✅ تم إزالة <@${userId}> انفك النوباك.`
      );
    }

    const userId = args[1];

    if (!/^\d+$/.test(userId || '')) {
      return message.reply(
        ':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.'
      );
    }

    noBackList.add(userId);
    saveData();

    try {
      await message.guild.members.ban(userId, {
        reason: 'نظام حماية النوباك (No-Back)'
      });

      return message.reply(`✅ <@${userId}> تم شقه بنجاح.`);
    } catch (error) {
      console.error(error);
      return message.reply(
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً (تأكد من وجود البوت فوق رتبته أو تمتعه بصلاحية Ban Members).`
      );
    }
  }

  const status = args[1]?.toLowerCase();

  if (status === 'on') {
    isNoBackEnabled = true;
    saveData();
    return message.reply(
      ':green_circle: تم تفعيل نظام النوباك.'
    );
  }

  if (status === 'off') {
    isNoBackEnabled = false;
    saveData();
    return message.reply(
      ':red_circle: تم إيقاف نظام النوباك.'
    );
  }

  return message.reply(
    `⚠️ الحالة الحالية للنظام: **${
      isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
    }**\nاستخدم \`!noback_protection on\` أو \`off\`.`
  );
});

client.on('guildBanRemove', async (ban) => {
  if (!isNoBackEnabled || !noBackList.has(ban.user.id)) return;

  try {
    await ban.guild.members.ban(ban.user.id, {
      reason: 'إعادة حظر تلقائي - نظام النوباك'
    });
  } catch (error) {
    console.error('[No-Back] تعذر إعادة الحظر:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);
