import CryptoJS from 'crypto-js';

// Generates a random strong key for each file
export const generateFileKey = () => CryptoJS.lib.WordArray.random(32).toString();

export const encryptFile = async (file: File, key: string): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const wa = CryptoJS.lib.WordArray.create(e.target?.result as any);
            const encrypted = CryptoJS.AES.encrypt(wa, key).toString();
            resolve(encrypted);
        };
        reader.readAsArrayBuffer(file);
    });
};