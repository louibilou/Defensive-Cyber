const MAGIC = new Uint8Array([70, 69, 78, 67, 49]); // FENC1
const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 250000;

// Encrypted file layout:
// [MAGIC(5)][SALT(16)][IV(12)][AES-GCM CIPHERTEXT+TAG]

const fileInput = document.getElementById("fileInput");
const passwordInput = document.getElementById("passwordInput");
const encryptBtn = document.getElementById("encryptBtn");
const decryptBtn = document.getElementById("decryptBtn");
const statusEl = document.getElementById("status");

encryptBtn.addEventListener("click", () => run("encrypt"));
decryptBtn.addEventListener("click", () => run("decrypt"));

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#1f7a59";
}

async function run(mode) {
  try {
    const file = fileInput.files[0];
    const password = passwordInput.value;

    if (!file) {
      throw new Error("Please choose a file first.");
    }
    if (!password) {
      throw new Error("Please enter a password.");
    }

    // UI feedback while browser crypto runs asynchronously.
    setStatus(`${mode === "encrypt" ? "Encrypting" : "Decrypting"}...`);

    if (mode === "encrypt") {
      await encryptFile(file, password);
      setStatus("Encryption complete. Download should begin automatically.");
    } else {
      await decryptFile(file, password);
      setStatus("Decryption complete. Download should begin automatically.");
    }
  } catch (error) {
    setStatus(error.message || "Operation failed.", true);
  }
}

async function encryptFile(file, password) {
  // Read original file bytes so any file type (text/image/pdf/etc.) is supported.
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  // Keep filename + MIME type with the data so decrypt restores original metadata.
  const payload = packPayload(file.name, file.type || "application/octet-stream", fileBytes);

  // Random salt and IV prevent repeated passwords/files from producing identical outputs.
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveAesKey(password, salt);

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload)
  );

  // Prefix salt and IV so decryption can reconstruct the exact same key/parameters.
  const output = concatBytes(MAGIC, salt, iv, encrypted);
  const outputName = `${file.name}.enc`;
  downloadBytes(output, outputName, "application/octet-stream");
}

async function decryptFile(file, password) {
  const data = new Uint8Array(await file.arrayBuffer());

  if (data.length < MAGIC.length + SALT_LEN + IV_LEN + 16) {
    throw new Error("Encrypted file appears invalid or corrupted.");
  }

  const magic = data.slice(0, MAGIC.length);
  if (!bytesEqual(magic, MAGIC)) {
    throw new Error("Unsupported file format. This file was not created by this app.");
  }

  const saltStart = MAGIC.length;
  const ivStart = saltStart + SALT_LEN;
  const encStart = ivStart + IV_LEN;

  const salt = data.slice(saltStart, ivStart);
  const iv = data.slice(ivStart, encStart);
  const encrypted = data.slice(encStart);

  // Re-derive the key from password + stored salt, then decrypt with stored IV.
  const key = await deriveAesKey(password, salt);

  let decrypted;
  try {
    decrypted = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted)
    );
  } catch {
    throw new Error("Wrong password or corrupted encrypted file.");
  }

  const { fileName, mimeType, content } = unpackPayload(decrypted);
  downloadBytes(content, fileName, mimeType);
}

async function deriveAesKey(password, salt) {
  // PBKDF2 stretches the password into a strong AES key.
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function packPayload(fileName, mimeType, content) {
  const nameBytes = new TextEncoder().encode(fileName);
  const typeBytes = new TextEncoder().encode(mimeType);

  if (nameBytes.length > 65535 || typeBytes.length > 65535) {
    throw new Error("File metadata is too large.");
  }

  // 4-byte header: [nameLen(2)][typeLen(2)] big-endian.
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint16(0, nameBytes.length, false);
  view.setUint16(2, typeBytes.length, false);

  return concatBytes(header, nameBytes, typeBytes, content);
}

function unpackPayload(payload) {
  if (payload.length < 4) {
    throw new Error("Decrypted payload is invalid.");
  }

  // Read metadata lengths first, then slice metadata and raw content.
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const nameLen = view.getUint16(0, false);
  const typeLen = view.getUint16(2, false);
  const minLen = 4 + nameLen + typeLen;

  if (payload.length < minLen) {
    throw new Error("Decrypted payload metadata is incomplete.");
  }

  const nameStart = 4;
  const typeStart = nameStart + nameLen;
  const dataStart = typeStart + typeLen;

  const fileName = new TextDecoder().decode(payload.slice(nameStart, typeStart));
  const mimeType = new TextDecoder().decode(payload.slice(typeStart, dataStart));
  const content = payload.slice(dataStart);

  return {
    fileName: fileName || "decrypted-file",
    mimeType: mimeType || "application/octet-stream",
    content,
  };
}

function concatBytes(...arrays) {
  // Manual byte concatenation to avoid text/binary encoding bugs.
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function downloadBytes(bytes, fileName, mimeType) {
  // Trigger a local browser download without sending data over the network.
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

