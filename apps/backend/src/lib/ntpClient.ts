import dgram from "node:dgram";
import dns from "node:dns/promises";
import net from "node:net";

const NTP_UNIX_EPOCH_OFFSET_SECONDS = 2_208_988_800;
const NTP_PACKET_BYTES = 48;
const NTP_PORT = 123;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export type NtpCheckResult = {
  server: string;
  address: string;
  checkedAt: string;
  stratum: number;
  offsetMs: number;
  roundTripMs: number;
};

export function normalizeNtpServer(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function isValidNtpServer(value: string): boolean {
  const normalized = normalizeNtpServer(value);
  if (!normalized || normalized.length > 253 || net.isIP(normalized) !== 0) return false;
  const labels = normalized.split(".");
  return labels.length >= 2 && labels.every((label) => HOST_LABEL.test(label));
}

function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [first, second] = address.split(".").map(Number);
    return !(first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || first >= 224);
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized !== "::"
      && normalized !== "::1"
      && !normalized.startsWith("fc")
      && !normalized.startsWith("fd")
      && !/^fe[89ab]/.test(normalized)
      && !normalized.startsWith("ff");
  }

  return false;
}

function writeNtpTimestamp(buffer: Buffer, offset: number, unixMs: number): void {
  const seconds = Math.floor(unixMs / 1000) + NTP_UNIX_EPOCH_OFFSET_SECONDS;
  const fraction = Math.floor(((unixMs % 1000) / 1000) * 0x1_0000_0000);
  buffer.writeUInt32BE(seconds >>> 0, offset);
  buffer.writeUInt32BE(fraction >>> 0, offset + 4);
}

function readNtpTimestamp(buffer: Buffer, offset: number): number {
  const seconds = buffer.readUInt32BE(offset) - NTP_UNIX_EPOCH_OFFSET_SECONDS;
  const fraction = buffer.readUInt32BE(offset + 4) / 0x1_0000_0000;
  return (seconds + fraction) * 1000;
}

export async function checkNtpServer(serverInput: string, timeoutMs = 3_000): Promise<NtpCheckResult> {
  const server = normalizeNtpServer(serverInput);
  if (!isValidNtpServer(server)) throw new Error("invalid_ntp_server");

  const addresses = await dns.lookup(server, { all: true, verbatim: true });
  const target = addresses.find((entry) => isPublicAddress(entry.address));
  if (!target) throw new Error("ntp_server_has_no_public_address");

  const socket = dgram.createSocket(target.family === 6 ? "udp6" : "udp4");
  const request = Buffer.alloc(NTP_PACKET_BYTES);
  request[0] = 0x23;
  const sentAt = Date.now();
  writeNtpTimestamp(request, 40, sentAt);

  try {
    const response = await new Promise<{ message: Buffer; receivedAt: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ntp_server_timeout")), timeoutMs);
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once("message", (message) => {
        clearTimeout(timer);
        resolve({ message, receivedAt: Date.now() });
      });
      socket.send(request, NTP_PORT, target.address, (error) => {
        if (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });

    if (response.message.length < NTP_PACKET_BYTES) throw new Error("invalid_ntp_response");
    const leap = response.message[0]! >> 6;
    const mode = response.message[0]! & 0x07;
    const stratum = response.message[1]!;
    if (leap === 3 || (mode !== 4 && mode !== 5) || stratum < 1 || stratum > 15) {
      throw new Error("invalid_ntp_response");
    }
    if (!response.message.subarray(24, 32).equals(request.subarray(40, 48))) {
      throw new Error("invalid_ntp_response_origin");
    }

    const serverReceivedAt = readNtpTimestamp(response.message, 32);
    const serverSentAt = readNtpTimestamp(response.message, 40);
    const offsetMs = ((serverReceivedAt - sentAt) + (serverSentAt - response.receivedAt)) / 2;
    const roundTripMs = (response.receivedAt - sentAt) - (serverSentAt - serverReceivedAt);

    return {
      server,
      address: target.address,
      checkedAt: new Date(response.receivedAt).toISOString(),
      stratum,
      offsetMs: Math.round(offsetMs * 100) / 100,
      roundTripMs: Math.max(0, Math.round(roundTripMs * 100) / 100)
    };
  } finally {
    socket.close();
  }
}
