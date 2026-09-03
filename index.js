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

// تحديد سبب الحظر المخصص بناءً على ID الشخص الذي أعطى النوباك
function getBanReason(executorId) {
  if (executorId === '1518574556787249177') return 'abu say no';
  if (executorId === '1496923040985124905') return 'Abu Khalid say no';
  if (executorId === '1422526730035396659') return 'Saud say no';
  return 'نظام حماية النوباك (No-Back)';
}

const dataFile = path.join(__dirname, 'noback.json');
let noBackList = new Map(); // تم التغيير إلى Map لتخزين (userID => executorID)
let isNoBackEnabled = true;

try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    if (data.users && typeof data.users === 'object' && !Array.isArray(data.users)) {
      noBackList = new Map(Object.entries(data.users));
    } else if (Array.isArray(data.users)) {
      data.users.forEach(id => noBackList.set(id, 'system'));
    } else if (Array.isArray(data)) {
      data.forEach(id => noBackList.set(id, 'system'));
    }

    if (typeof data.enabled === 'boolean') {
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
        users: Object.fromEntries(noBackList)
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

client.once('ready', () => {
  console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);
});

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

  // --- معالجة أمر !noback ---
  if (command === '!noback') {
    const action = args[1]?.toLowerCase();

    // 1. عرض القائمة
    if (action === 'list') {
      if (noBackList.size === 0) {
        return message.reply(':clipboard: قائمة النوباك فارغة حالياً.');
      }

      const list = [...noBackList.keys()]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return message.reply(
        `📋 **قائمة المحظورين نوباك (${noBackList.size}):**\n${list}`
      );
    }

    // 2. إزالة شخص من النوباك
    if (action === 'removed' || action === 'remove') {
      const userId = args[2];

      if (!/^\d+$/.test(userId || '')) {
        return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
      }

      if (!noBackList.has(userId)) {
        return message.reply(':warning: غلطان يالاخو.');
      }

      noBackList.delete(userId);
      saveData();
      return message.reply(`✅ تم إزالة <@${userId}> انفك النوباك.`);
    }

    // 3. إضافة شخص إلى النوباك وبندته
    const userId = args[1];

    if (!/^\d+$/.test(userId || '')) {
      return message.reply(
        ':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.'
      );
    }

    // حفظ الشخص ومعرفة من اللي عطاه النوباك
    const executorId = message.author.id;
    const banReason = getBanReason(executorId);

    noBackList.set(userId, executorId);
    saveData();

    try {
      await message.guild.members.ban(userId, {
        reason: banReason
      });

      return message.reply(`✅ <@${userId}> تم شقه بنجاح.\n📝 السبب: \`${banReason}\``);
    } catch (error) {
      console.error(error);
      return message.reply(
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً (تأكد من وجود البوت فوق رتبته أو تمتعه بصلاحية Ban Members).`
      );
    }
  }

  // --- معالجة أمر !noback_protection ---
  if (command === '!noback_protection') {
    const status = args[1]?.toLowerCase();

    if (status === 'on') {
      isNoBackEnabled = true;
      saveData();
      return message.reply(':green_circle: تم تفعيل نظام النوباك.');
    }

    if (status === 'off') {
      isNoBackEnabled = false;
      saveData();
      return message.reply(':red_circle: تم إيقاف نظام النوباك.');
    }

    return message.reply(
      `⚠️ الحالة الحالية للنظام: **${
        isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
      }**\nاستخدم \`!noback_protection on\` أو \`off\`.`
    );
  }
});

// إعادة الحظر التلقائي بنفس السبب المخزن للآيدي صاحب الأمر
client.on('guildBanRemove', async (ban) => {
  if (!isNoBackEnabled || !noBackList.has(ban.user.id)) return;

  const executorId = noBackList.get(ban.user.id);
  const banReason = getBanReason(executorId);

  try {
    await ban.guild.members.ban(ban.user.id, {
      reason: `مايرجع الا من الي بنده - ${banReason}`
    });
  } catch (error) {
    console.error('[No-Back] تعذر إعادة الحظر:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);
