import axios from 'axios';

// Sends a command to the backend: action is one of 'immobilize' | 'resume'
export async function sendCommand(action, baseUrl) {
  try {
    const res = await axios.post(`${baseUrl}/command`, { action });
    return res.data;
  } catch (e) {
    return { status: 'error', message: 'Network or server error' };
  }
}
