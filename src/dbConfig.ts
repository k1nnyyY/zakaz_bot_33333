import dotenv from 'dotenv';
dotenv.config();

const dbConnectionString = process.env.MONGO_URI || "mongodb+srv://osman:kina@cluster0.8j2ykko.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

export default dbConnectionString;
