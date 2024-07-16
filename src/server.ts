import express from "express";
import bodyParser from "body-parser";
import TelegramBot, { Message, CallbackQuery, KeyboardButton, ReplyKeyboardMarkup } from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import mongoose, { Schema, Document } from "mongoose";
import dotenv from "dotenv";
import dbConnectionString from "./dbConfig.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

interface ILesson extends Document {
  playlist: string;
  lessonNumber: number;
  videoUrl: string;
  description: string;
  imageUrl: string;
  hasSubLessons: boolean;
  subLessons?: Array<{
    lessonNumber: number;
    title: string;
    videoUrl: string;
  }>;
}

const LessonSchema: Schema = new Schema({
  playlist: { type: String, required: true },
  lessonNumber: { type: Number, required: true },
  videoUrl: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
  hasSubLessons: { type: Boolean, required: true },
  subLessons: [
    {
      lessonNumber: { type: Number, required: false },
      title: { type: String, required: false },
      videoUrl: { type: String, required: false },
    },
  ],
});

const Lesson = mongoose.model<ILesson>("Lesson", LessonSchema);

interface IMerch extends Document {
  name: string;
  price: number;
  description: string;
  images: string[];
}

const MerchSchema: Schema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, required: true },
  images: { type: [String], required: true },
});

const Merch = mongoose.model<IMerch>("Merch", MerchSchema);

interface IUser extends Document {
  chatId: number;
  authenticated: boolean;
  isAdmin: boolean;
  messageIds: number[];
  guideAccess: string[];
  lessonAccess: number[];
}

const UserSchema: Schema = new Schema({
  chatId: { type: Number, required: true, unique: true },
  authenticated: { type: Boolean, required: true, default: false },
  isAdmin: { type: Boolean, required: true, default: false },
  messageIds: { type: [Number], default: [] },
  guideAccess: { type: [String], default: [] },
  lessonAccess: { type: [Number], default: [] },
});

const User = mongoose.model<IUser>("User", UserSchema);

const app = express();
const PORT = process.env.PORT || "3000";
const TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN";

console.log("Starting Telegram Bot...");
const bot = new TelegramBot(TOKEN, { polling: true });

app.use(bodyParser.json());

mongoose.set("strictQuery", true);

await mongoose
  .connect(dbConnectionString, {})
  .then(async () => {
    console.log("Connected to MongoDB");

    const imagesPath = path.join(__dirname, "images");
    if (!fs.existsSync(imagesPath)) {
      fs.mkdirSync(imagesPath);
    }

    function checkPassword(password: string): boolean {
      const filePath = path.join(__dirname, "../passwords.txt");
      const passwords = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((p) => p.trim());
      return passwords.includes(password.trim());
    }

    function checkGuidePassword(password: string, guideName: string): boolean {
      const filePath = path.join(__dirname, `../passwords/guide_${guideName}.txt`);
      const storedPassword = fs.readFileSync(filePath, "utf-8").trim();
      return storedPassword === password.trim();
    }

    function checkLessonPassword(password: string, lessonNumber: number): boolean {
      const filePath = path.join(__dirname, `../passwords/lesson_${lessonNumber}.txt`);
      const storedPassword = fs.readFileSync(filePath, "utf-8").trim();
      return storedPassword === password.trim();
    }

    function checkAdminPassword(password: string): boolean {
      const filePath = path.join(__dirname, "../admin_passwords.txt");
      const passwords = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((p) => p.trim());
      return passwords.includes(password.trim());
    }

    function getPasswordFilePathForGuide(guideName: string): string {
      return path.join(__dirname, `../passwords/guide_${guideName}.txt`);
    }

    function getPasswordFilePathForLesson(lessonNumber: number): string {
      return path.join(__dirname, `../passwords/lesson_${lessonNumber}.txt`);
    }

    bot.onText(/\/start/, async (msg: Message) => {
      const chatId = msg.chat.id;

      const user = await User.findOne({ chatId });
      if (user && user.authenticated) {
        const message = user.isAdmin
          ? "Вы вошли как администратор! Выберите раздел."
          : "Вы уже вошли в систему! Выберите раздел.";

        const keyboard: KeyboardButton[][] = user.isAdmin
          ? [
              [{ text: "Управление уроками 📚" }],
              [{ text: "Управление мерчем 🛒" }],
              [{ text: "Управление паролями 🛠" }],
              [{ text: "Logout" }],
            ]
          : [
              ...(user.guideAccess.includes("guide1") ? [[{ text: "Гайды 🥋" }]] : []),
              ...(user.guideAccess.includes("guide2") ? [[{ text: "Гайды 🥋" }]] : []),
              ...(user.guideAccess.includes("guide3") ? [[{ text: "Гайды 🥋" }]] : []),
              [{ text: "Видео Курсы 🎉" }],
              [{ text: "Отзывы 💬" }],
              [{ text: "Помощь 🚨" }],
              [{ text: "Как работать с ботом ❓" }],
              [{ text: "Мерч 🛒" }],
              [{ text: "Logout" }],
            ];

        const sentMessage = await bot.sendMessage(chatId, message, {
          reply_markup: {
            keyboard: keyboard,
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });

        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      } else {
        const sentMessage = await bot.sendMessage(
          chatId,
          "Добро пожаловать! Пожалуйста, нажмите кнопку Login для входа.",
          {
            reply_markup: {
              keyboard: [[{ text: "Login" }, { text: "Мерч 🛒" }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        );

        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      }
    });

    bot.on("message", async (msg: Message) => {
      const chatId = msg.chat.id;
      const text: string | undefined = msg.text;

      const user = await User.findOne({ chatId });

      if (text === "Мерч 🛒") {
        const merches = await Merch.find({});

        for (const merch of merches) {
          const inlineKeyboard = [
            [
              {
                text: "Купить",
                callback_data: JSON.stringify({
                  action: "buy",
                  merchId: (merch._id as mongoose.Types.ObjectId).toString(),
                }),
              },
            ],
          ];

          let imagesText = merch.images.map(
            (imagePath) => `[Фото](${imagePath})`
          ).join("\n");

          const sentMessage = await bot.sendMessage(
            chatId,
            `${merch.name}\nЦена: ${merch.price}\nОписание: ${merch.description}\n${imagesText}`,
            {
              reply_markup: {
                inline_keyboard: inlineKeyboard,
              },
              parse_mode: "Markdown",
            }
          );

          if (user) {
            user.messageIds.push(sentMessage.message_id);
            await user.save();
          }
        }
        return;
      }

      if (user && user.authenticated) {
        if (text === "Logout") {
          await User.findOneAndUpdate(
            { chatId },
            { authenticated: false, isAdmin: false }
          );
          const sentMessage = await bot.sendMessage(
            chatId,
            "Вы успешно вышли из системы.",
            {
              reply_markup: {
                keyboard: [[{ text: "Login" }, { text: "Мерч 🛒" }]],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            }
          );

          if (user) {
            user.messageIds.push(sentMessage.message_id);
            await user.save();
          }
        } else if (user.isAdmin) {
          if (text === "Управление уроками 📚") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите действие:",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Добавить урок" }],
                    [{ text: "Удалить урок" }],
                    [{ text: "Просмотреть уроки" }],
                    [{ text: "Назад" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }
          } else if (text === "Добавить урок") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Пожалуйста, отправьте картинку для превью урока."
            );
            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }

            bot.once("photo", async (msg: Message) => {
              const fileId = msg.photo?.[msg.photo.length - 1].file_id;
              if (!fileId) return;

              const file = await bot.getFile(fileId);
              const filePath = file.file_path;
              if (!filePath) return;
              const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
              const localPath = path.join(imagesPath, path.basename(filePath));
              const fileStream = fs.createWriteStream(localPath);

              https.get(fileUrl, (response: any) => {
                response.pipe(fileStream);
                fileStream.on("finish", async () => {
                  fileStream.close();

                  const sentMessage = await bot.sendMessage(
                    chatId,
                    "Теперь введите данные урока в формате:\n1) Плейлист\n2) Номер урока\n3) URL видео\n4) Описание\n5) Есть подуроки (да/нет)",
                    {
                      reply_markup: {
                        force_reply: true,
                      },
                    }
                  );

                  if (user) {
                    user.messageIds.push(sentMessage.message_id);
                    await user.save();
                  }

                  bot.onReplyToMessage(
                    chatId,
                    sentMessage.message_id,
                    async (reply) => {
                      const lessonData = reply.text
                        ?.split("\n")
                        .map((item) => item.replace(/^\d+\)\s*/, "").trim());
                      if (lessonData && lessonData.length >= 5) {
                        const newLesson = new Lesson({
                          playlist: lessonData[0],
                          lessonNumber: Number(lessonData[1]),
                          videoUrl: lessonData[2],
                          description: lessonData[3],
                          imageUrl: localPath,
                          hasSubLessons: lessonData[4].toLowerCase() === "да",
                        });
                        try {
                          await newLesson.save();
                          await bot.sendMessage(chatId, "Урок добавлен.");
                        } catch (error) {
                          await bot.sendMessage(
                            chatId,
                            "Произошла ошибка при добавлении урока."
                          );
                        }
                      } else {
                        await bot.sendMessage(
                          chatId,
                          "Неверный формат данных. Попробуйте снова."
                        );
                      }
                    }
                  );
                });
              });
            });
          } else if (text === "Удалить урок") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Введите номер урока для удаления:",
              {
                reply_markup: {
                  force_reply: true,
                },
              }
            );

            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }

            bot.onReplyToMessage(
              chatId,
              sentMessage.message_id,
              async (reply) => {
                const lessonNumber = reply.text?.trim();
                if (lessonNumber) {
                  await Lesson.deleteOne({
                    lessonNumber: Number(lessonNumber),
                  });
                  await bot.sendMessage(chatId, "Урок удален.");
                } else {
                  await bot.sendMessage(
                    chatId,
                    "Неверный номер урока. Попробуйте снова."
                  );
                }
              }
            );
          } else if (text === "Просмотреть уроки") {
            const lessons = await Lesson.find({}).sort({ lessonNumber: 1 });

            for (const lesson of lessons) {
              const inlineKeyboard =
                lesson.subLessons?.map((subLesson) => [
                  {
                    text: subLesson.title,
                    callback_data: JSON.stringify({
                      lessonNumber: lesson.lessonNumber,
                      subLessonNumber: subLesson.lessonNumber,
                    }),
                  },
                ]) || [];

              if (lesson.imageUrl) {
                const sentMessage = await bot.sendPhoto(
                  chatId,
                  lesson.imageUrl,
                  {
                    caption: `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: inlineKeyboard,
                    },
                  }
                );
                if (user) {
                  user.messageIds.push(sentMessage.message_id);
                }
              } else {
                const sentMessage = await bot.sendMessage(
                  chatId,
                  `Урок ${lesson.lessonNumber}: ${lesson.description}\n[Смотреть видео](${lesson.videoUrl})`,
                  {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: inlineKeyboard,
                    },
                  }
                );
                if (user) {
                  user.messageIds.push(sentMessage.message_id);
                }
              }
            }
            if (user) {
              await user.save();
            }
          } else if (text === "Управление мерчем 🛒") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите действие:",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Добавить мерч" }],
                    [{ text: "Удалить мерч" }],
                    [{ text: "Просмотреть мерч" }],
                    [{ text: "Назад" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }
          } else if (text === "Добавить мерч") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Пожалуйста, отправьте картинки для мерча (до 3 картинок)."
            );
            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }

            bot.once("photo", async (msg: Message) => {
              const fileIds = msg.photo?.map((photo) => photo.file_id) || [];
              const imagePaths: string[] = [];
              if (fileIds.length === 0) return;

              for (const fileId of fileIds) {
                const file = await bot.getFile(fileId);
                const filePath = file.file_path;
                if (!filePath) continue;
                const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
                const localPath = path.join(
                  imagesPath,
                  path.basename(filePath)
                );
                const fileStream = fs.createWriteStream(localPath);

                https.get(fileUrl, (response: any) => {
                  response.pipe(fileStream);
                });

                imagePaths.push(localPath);
              }

              const sentMessage = await bot.sendMessage(
                chatId,
                "Теперь введите данные мерча в формате:\n1) Название\n2) Цена\n3) Описание",
                {
                  reply_markup: {
                    force_reply: true,
                  },
                }
              );

              if (user) {
                user.messageIds.push(sentMessage.message_id);
                await user.save();
              }

              bot.onReplyToMessage(
                chatId,
                sentMessage.message_id,
                async (reply) => {
                  const merchData = reply.text
                    ?.split("\n")
                    .map((item) => item.replace(/^\d+\)\s*/, "").trim());
                  if (merchData && merchData.length >= 3) {
                    const newMerch = new Merch({
                      name: merchData[0],
                      price: Number(merchData[1]),
                      description: merchData[2],
                      images: imagePaths,
                    });
                    try {
                      await newMerch.save();
                      await bot.sendMessage(chatId, "Мерч добавлен.");
                    } catch (error) {
                      await bot.sendMessage(
                        chatId,
                        "Произошла ошибка при добавлении мерча."
                      );
                    }
                  } else {
                    await bot.sendMessage(
                      chatId,
                      "Неверный формат данных. Попробуйте снова."
                    );
                  }
                }
              );
            });
          } else if (text === "Удалить мерч") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Введите название мерча для удаления:",
              {
                reply_markup: {
                  force_reply: true,
                },
              }
            );

            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }

            bot.onReplyToMessage(
              chatId,
              sentMessage.message_id,
              async (reply) => {
                const merchName = reply.text?.trim();
                if (merchName) {
                  await Merch.deleteOne({ name: merchName });
                  await bot.sendMessage(chatId, "Мерч удален.");
                } else {
                  await bot.sendMessage(
                    chatId,
                    "Неверное название мерча. Попробуйте снова."
                  );
                }
              }
            );
          } else if (text === "Просмотреть мерч") {
            const merches = await Merch.find({});

            for (const merch of merches) {
              const inlineKeyboard = [
                [
                  {
                    text: "Купить",
                    callback_data: JSON.stringify({
                      action: "buy",
                      merchId: (
                        merch._id as mongoose.Types.ObjectId
                      ).toString(),
                    }),
                  },
                ],
              ];

              let imagesText = merch.images.map(
                (imagePath) => `[Фото](${imagePath})`
              ).join("\n");

              const sentMessage = await bot.sendMessage(
                chatId,
                `${merch.name}\nЦена: ${merch.price}\nОписание: ${merch.description}\n${imagesText}`,
                {
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
                  },
                  parse_mode: "Markdown",
                }
              );

              if (user) {
                user.messageIds.push(sentMessage.message_id);
                await user.save();
              }
            }
          } else if (text === "Управление паролями 🛠") {
            const guides = ["guide1", "guide2", "guide3"];
            const lessons = await Lesson.find({}).sort({ lessonNumber: 1 });

            const guideButtons = guides.map(guide => [{ text: `Удалить пароль для гайда ${guide}` }]);
            const lessonButtons = lessons.map(lesson => [{ text: `Удалить пароль для урока ${lesson.lessonNumber} (${lesson.description})` }]);
            const keyboard: KeyboardButton[][] = guideButtons.concat(lessonButtons).concat([[{ text: "Назад" }]]);

            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите гайд или урок для удаления пароля:",
              {
                reply_markup: {
                  keyboard: keyboard,
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );
            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }

            bot.once("message", async (msg: Message) => {
              const text = msg.text?.trim();
              const isGuide = text?.startsWith("Удалить пароль для гайда");
              const isLesson = text?.startsWith("Удалить пароль для урока");

              if (isGuide || isLesson) {
                const entity = text?.replace("Удалить пароль для гайда ", "").replace("Удалить пароль для урока ", "");
                if (isGuide) {
                  const filePath = getPasswordFilePathForGuide(entity!);
                  if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                  }
                } else if (isLesson) {
                  const lessonNumber = parseInt(entity!.split(" ")[0]);
                  const filePath = getPasswordFilePathForLesson(lessonNumber);
                  if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                  }
                }
                await bot.sendMessage(chatId, "Пароль удален.");
              }
            });
          } else if (text === "Назад") {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Выберите раздел.",
              {
                reply_markup: {
                  keyboard: [
                    [{ text: "Управление уроками 📚" }],
                    [{ text: "Управление мерчем 🛒" }],
                    [{ text: "Управление паролями 🛠" }],
                    [{ text: "Logout" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }
          }
        }
      } else if (text === "Login") {
        const sentMessage = await bot.sendMessage(
          chatId,
          "Пожалуйста, введите ваш пароль."
        );
        if (user) {
          user.messageIds.push(sentMessage.message_id);
          await user.save();
        }
      } else if (text) {
        console.log(`Received login attempt with text: ${text}`);

        if (checkAdminPassword(text)) {
          const updatedUser = await User.findOneAndUpdate(
            { chatId },
            { authenticated: true, isAdmin: true },
            { upsert: true, new: true }
          );

          const sentMessage = await bot.sendMessage(
            chatId,
            "Вы вошли как администратор! Выберите раздел.",
            {
              reply_markup: {
                keyboard: [
                  [{ text: "Управление уроками 📚" }],
                  [{ text: "Управление мерчем 🛒" }],
                  [{ text: "Управление паролями 🛠" }],
                  [{ text: "Logout" }],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
              },
            }
          );

          if (updatedUser) {
            updatedUser.messageIds.push(sentMessage.message_id);
            await updatedUser.save();
          }
        } else if (text.includes(" ")) {
          const [entity, password] = text.split(" ");
          const isGuide = entity.startsWith("guide");
          const isLesson = entity.startsWith("lesson");

          console.log(`Parsed entity: ${entity}, password: ${password}`);

          if (isGuide && checkGuidePassword(password, entity)) {
            console.log(`Guide password check passed for ${entity}`);
            const updatedUser = await User.findOneAndUpdate(
              { chatId },
              { authenticated: true, isAdmin: false, $addToSet: { guideAccess: entity } },
              { upsert: true, new: true }
            );

            const sentMessage = await bot.sendMessage(
              chatId,
              `Пароль верный! Вы получили доступ к гайду ${entity}. Выберите раздел.`,
              {
                reply_markup: {
                  keyboard: [
                    ...(updatedUser?.guideAccess.includes("guide1") ? [[{ text: "Гайды 🥋" }]] : []),
                    ...(updatedUser?.guideAccess.includes("guide2") ? [[{ text: "Гайды 🥋" }]] : []),
                    ...(updatedUser?.guideAccess.includes("guide3") ? [[{ text: "Гайды 🥋" }]] : []),
                    [{ text: "Видео Курсы 🎉" }],
                    [{ text: "Отзывы 💬" }],
                    [{ text: "Помощь 🚨" }],
                    [{ text: "Как работать с ботом ❓" }],
                    [{ text: "Мерч 🛒" }],
                    [{ text: "Logout" }],
                  ],
                  one_time_keyboard: true,
                  resize_keyboard: true,
                },
              }
            );

            if (updatedUser) {
              updatedUser.messageIds.push(sentMessage.message_id);
              await updatedUser.save();
            }
          } else if (isLesson) {
            const lessonNumber = parseInt(entity.replace("lesson", ""));
            if (!isNaN(lessonNumber) && checkLessonPassword(password, lessonNumber)) {
              console.log(`Lesson password check passed for lesson ${lessonNumber}`);
              const updatedUser = await User.findOneAndUpdate(
                { chatId },
                { authenticated: true, isAdmin: false, $addToSet: { lessonAccess: lessonNumber } },
                { upsert: true, new: true }
              );

              const sentMessage = await bot.sendMessage(
                chatId,
                `Пароль верный! Вы получили доступ к уроку ${lessonNumber}. Выберите раздел.`,
                {
                  reply_markup: {
                    keyboard: [
                      ...(updatedUser?.guideAccess.includes("guide1") ? [[{ text: "Гайды 🥋" }]] : []),
                      ...(updatedUser?.guideAccess.includes("guide2") ? [[{ text: "Гайды 🥋" }]] : []),
                      ...(updatedUser?.guideAccess.includes("guide3") ? [[{ text: "Гайды 🥋" }]] : []),
                      [{ text: "Видео Курсы 🎉" }],
                      [{ text: "Отзывы 💬" }],
                      [{ text: "Помощь 🚨" }],
                      [{ text: "Как работать с ботом ❓" }],
                      [{ text: "Мерч 🛒" }],
                      [{ text: "Logout" }],
                    ],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                  },
                }
              );

              if (updatedUser) {
                updatedUser.messageIds.push(sentMessage.message_id);
                await updatedUser.save();
              }
            } else {
              const sentMessage = await bot.sendMessage(
                chatId,
                "Пароль неверный, попробуйте снова."
              );
              if (user) {
                user.messageIds.push(sentMessage.message_id);
                await user.save();
              }
            }
          } else {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Пароль неверный, попробуйте снова."
            );
            if (user) {
              user.messageIds.push(sentMessage.message_id);
              await user.save();
            }
          }
        } else {
          const sentMessage = await bot.sendMessage(
            chatId,
            "Пароль неверный, попробуйте снова."
          );
          if (user) {
            user.messageIds.push(sentMessage.message_id);
            await user.save();
          }
        }
      }
    });

    bot.on("callback_query", async (callbackQuery: CallbackQuery) => {
      const { message, data } = callbackQuery;
      if (!message || !data) {
        console.error("Callback query missing message or data", {
          message,
          data,
        });
        return;
      }

      const chatId = message.chat.id;

      try {
        const { action, merchId } = JSON.parse(data);
        if (action === "buy") {
          const merch = await Merch.findById(merchId);
          if (merch) {
            const buyMessage = `Перешлите это сообщение Марату Курбанову: ${merch.name}\nЦена: ${merch.price}\nОписание: ${merch.description}`;
            await bot.sendMessage(chatId, buyMessage);
          } else {
            await bot.sendMessage(chatId, "Товар не найден.");
          }
        } else {
          console.error("Unknown action in callback query:", action);
        }
      } catch (error) {
        console.error("Error parsing callback data or sending message:", error);
        await bot.sendMessage(chatId, "Произошла ошибка при обработке вашего запроса.");
      }
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
