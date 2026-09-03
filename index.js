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
const processLockFile = path.join(__dirname, '.noback-bot.lock');
const replyLocksDir = path.join(__dirname, '.noback-reply-locks');
const handledMessages = new Set();
let noBackList = new Set();
let isNoBackEnabled = true;

function acquireProcessLock() {
  let lockFile;

  try {
    lockFile = fs.openSync(processLockFile, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;

    let oldPid = 0;
    try {
      oldPid = Number(fs.readFileSync(processLockFile, 'utf8'));
    } catch {}

    if (oldPid) {
      try {
        process.kill(oldPid, 0);
        throw new Error(
          `يوجد تشغيل آخر للبوت بالفعل (PID: ${oldPid}). أوقفه أولاً.`
        );
      } catch (checkError) {
        if (checkError.message.includes('يوجد تشغيل آخر')) {
          throw checkError;
        }
      }
    }

    fs.rmSync(processLockFile, { force: true });
    lockFile = fs.openSync(processLockFile, 'wx');
  }

  fs.writeSync(lockFile, String(process.pid));
  fs.closeSync(lockFile);

  const releaseLock = () => {
    fs.rmSync(processLockFile, { force: true });
  };

  process.once('exit', releaseLock);
  process.once('SIGINT', () => {
    releaseLock();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    releaseLock();
    process.exit(0);
  });
}

acquireProcessLock();

try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const users = Array.isArray(data) ? data : data.users;
    if (Array.isArray(users)) noBackList = new Set(users);
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
    )
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

async function replyOnce(message, content) {
  fs.mkdirSync(replyLocksDir, { recursive: true });
  const lockPath = path.join(replyLocksDir, message.id);

  // mkdir عملية ذرّية؛ تمنع نسختين من البوت من الرد على نفس الرسالة.
  try {
    fs.mkdirSync(lockPath);
  } catch {
    return;
  }

  try {
    const recentMessages = await message.channel.messages.fetch({
      limit: 50
    });
    const alreadyReplied = recentMessages.some(
      item =>
        item.author.id === client.user.id &&
        item.reference?.messageId === message.id
    );

    if (!alreadyReplied) return await message.reply(content);
  } catch (error) {
    console.error('تعذر التحقق من الرد السابق:', error);
  } finally {
    setTimeout(() => {
      fs.rmSync(lockPath, { recursive: true, force: true });
    }, 120_000);
  }
}

client.once('clientReady', () => {
  console.log(`✅ تم تشغيل البوت باسم: ${client.user.tag}`);
});

// حذف أي رد مكرر موجود لنفس الأمر، حتى لو كان من نسخة قديمة للبوت.
client.on('messageCreate', async (message) => {
  if (
    !message.author.bot ||
    message.author.id !== client.user.id ||
    !message.reference?.messageId
  ) {
    return;
  }

  try {
    const recentMessages = await message.channel.messages.fetch({
      limit: 50
    });
    const replies = [...recentMessages.values()]
      .filter(
        item =>
          item.author.id === client.user.id &&
          item.reference?.messageId === message.reference.messageId
      )
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    for (const duplicate of replies.slice(1)) {
      await duplicate.delete().catch(() => {});
    }
  } catch (error) {
    console.error('تعذر حذف الرد المكرر:', error);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (handledMessages.has(message.id)) return;

  handledMessages.add(message.id);
  setTimeout(() => handledMessages.delete(message.id), 60_000);

  const args = message.content.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (command === '!noback') {
    if (!isAllowed(message)) {
      return replyOnce(message, ':x: اشحت ابو خالد يعطيك برميشن.');
    }

    const action = args[1]?.toLowerCase();

    if (action === 'list') {
      if (noBackList.size === 0) {
        return replyOnce(
          message,
          ':clipboard: قائمة النوباك فارغة حالياً.'
        );
      }

      const list = [...noBackList]
        .map(id => `- <@${id}> (${id})`)
        .join('\n');

      return replyOnce(
        message,
        `📋 **قائمة المحظورين نوباك (${noBackList.size}):**\n${list}`
      );
    }

    if (action === 'removed') {
      const userId = args[2];

      if (!/^\d+$/.test(userId || '')) {
        return replyOnce(
          message,
          ':warning: يرجى كتابة الـ ID الصحيح.'
        );
      }

      if (!noBackList.has(userId)) {
        return replyOnce(message, ':warning: غلطان يالاخو.');
      }

      noBackList.delete(userId);
      saveData();
      return replyOnce(
        message,
        `✅ تم إزالة <@${userId}> انفك النوباك.`
      );
    }

    const userId = args[1];

    if (!/^\d+$/.test(userId || '')) {
      return replyOnce(
        message,
        ':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.'
      );
    }

    noBackList.add(userId);
    saveData();

    try {
      await message.guild.members.ban(userId, {
        reason: 'نظام حماية النوباك (No-Back)'
      });
      return replyOnce(message, `✅ <@${userId}> تم شقه بنجاح.`);
    } catch (error) {
      console.error(error);
      return replyOnce(
        message,
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً (تأكد من وجود البوت فوق رتبته أو تمتعه بصلاحية Ban Members).`
      );
    }
  }

  if (command === '!noback_protection') {
    if (!isAllowed(message)) {
      return replyOnce(message, ':x: اشحت ابو خالد يعطيك برميشن.');
    }

    const status = args[1]?.toLowerCase();

    if (status === 'on') {
      isNoBackEnabled = true;
      saveData();
      return replyOnce(
        message,
        ':green_circle: تم تفعيل نظام النوباك.'
      );
    }

    if (status === 'off') {
      isNoBackEnabled = false;
      saveData();
      return replyOnce(
        message,
        ':red_circle: تم إيقاف نظام النوباك.'
      );
    }

    return replyOnce(
      message,
      `⚠️ الحالة الحالية للنظام: **${
        isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
      }**\nاستخدم \`!noback_protection on\` أو \`off\`.`
    );
  }
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
