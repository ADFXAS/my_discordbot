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
// قائمة المعرفات المسموح لها باستخدام أوامر النوباك
const ALLOWED_USERS = [
  '1518574556787249177' 
 ' 1496923040985124905' 
' 1422526730035396659' 
];
// ملف حفظ قائمة النوباك
const noBackFile = path.join(__dirname, 'noback.json');
// تحميل البيانات المحفوظة عند تشغيل البوت
let noBackList = new Set();
let isNoBackEnabled = true;
try {
  if (fs.existsSync(noBackFile)) {
    const savedData = JSON.parse(
      fs.readFileSync(noBackFile, 'utf8')
    );
    // دعم الملف القديم إذا كان عبارة عن Array فقط
    const savedUsers = Array.isArray(savedData)
      ? savedData
      : savedData.users;
    if (Array.isArray(savedUsers)) {
      noBackList = new Set(savedUsers);
    }
    if (
      !Array.isArray(savedData) &&
      typeof savedData.enabled === 'boolean'
    ) {
      isNoBackEnabled = savedData.enabled;
    }
  }
} catch (error) {
  console.error('تعذر تحميل بيانات النوباك:', error);
}
// حفظ قائمة النوباك وحالة الحماية
function saveNoBackData() {
  fs.writeFileSync(
    noBackFile,
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
client.once('clientReady', () => {
  console.log(`✅ تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);
});
// التعامل مع أوامر النوباك
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const isAllowed =
    ALLOWED_USERS.includes(message.author.id) ||
    message.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );
  // إضافة شخص إلى قائمة النوباك وتطبيق الباند فوراً
  if (message.content.startsWith('!noback add')) {
    if (!isAllowed) {
      return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    }
    const args = message.content.trim().split(/ +/);
    const userId = args[2];
    if (!userId || isNaN(userId)) {
      return message.reply(
        ':warning: يرجى كتابة الـ ID الصحيح للطرف المستهدف.'
      );
    }
    noBackList.add(userId);
    saveNoBackData();
    try {
      await message.guild.members.ban(userId, {
        reason: 'نظام حماية النوباك (No-Back)'
      });
      return message.reply(
        `✅ <@${userId}> تم شقه بنجاح.`
      );
    } catch (error) {
      console.error(error);
      return message.reply(
        `✅ تم إضافة <@${userId}> للقائمة، لكن تعذر تبنيده فوراً (تأكد من وجود البوت فوق رتبته أو تمتعه بصلاحية Ban Members).`
      );
    }
  }
  // إزالة شخص من قائمة النوباك
  if (message.content.startsWith('!noback remove')) {
    if (!isAllowed) {
      return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    }
    const args = message.content.trim().split(/ +/);
    const userId = args[2];
    if (!userId || isNaN(userId)) {
      return message.reply(':warning: يرجى كتابة الـ ID الصحيح.');
    }
    if (noBackList.has(userId)) {
      noBackList.delete(userId);
      saveNoBackData();
      return message.reply(
        `✅ تم إزالة <@${userId}> انفك النوباك.`
      );
    } else {
      return message.reply(':warning: غلطان يالاخو.');
    }
  }
  // عرض قائمة النوباك
  if (message.content === '!noback list') {
    if (!isAllowed) {
      return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    }
    if (noBackList.size === 0) {
      return message.reply(
        ':clipboard: قائمة النوباك فارغة حالياً.'
      );
    }
    const list = Array.from(noBackList)
      .map(id => `- <@${id}> (${id})`)
      .join('\n');
    return message.reply(
      `📋 **قائمة المحظورين نوباك (${noBackList.size}):**\n${list}`
    );
  }
  // تفعيل أو تعطيل حماية النوباك
  if (message.content.startsWith('!noback_protection')) {
    if (!isAllowed) {
      return message.reply(':x: اشحت ابو خالد يعطيك برميشن.');
    }
    const args = message.content.trim().split(/ +/);
    const status = args[1]?.toLowerCase();
    if (status === 'on') {
      isNoBackEnabled = true;
      saveNoBackData();
      return message.reply(
        ':green_circle: تم تفعيل نظام النوباك.'
      );
    }
    if (status === 'off') {
      isNoBackEnabled = false;
      saveNoBackData();
      return message.reply(
        ':red_circle: تم إيقاف نظام النوباك.'
      );
    }
    return message.reply(
      `⚠️ الحالة الحالية للنظام: **${
        isNoBackEnabled ? 'مفعل 🟢' : 'معطل 🔴'
      }**\nاستخدم \`!noback_protection on\` أو \`off\`.`
    );
  }
});
// إعادة حظر الشخص تلقائياً عند فك الباند
client.on('guildBanRemove', async (ban) => {
  if (!isNoBackEnabled) return;
  const userId = ban.user.id;
  if (noBackList.has(userId)) {
    await ban.guild.members.ban(userId, {
      reason: 'إعادة حظر تلقائي - نظام النوباك'
    });
    console.log(
      `[No-Back] تم إعادة حظر المستهدف تلقائياً: ${ban.user.tag}`
    );
  }
});
client.login(process.env.DISCORD_TOKEN);
