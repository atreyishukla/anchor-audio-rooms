import './style.css';
import AgoraRTC from "agora-rtc-sdk-ng";
import AgoraRTM from "agora-rtm-sdk";

import appid from './appid.js';

const token = null;
const rtcUid = Math.floor(Math.random() * 2032);
const rtmUid = String(Math.floor(Math.random() * 2032));

const getRoomId = () => {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  return urlParams.get('room') ? urlParams.get('room').toLowerCase() : null;
};

let roomId = getRoomId() || null;
document.getElementById('form').roomname.value = roomId;

let audioTracks = {
  localAudioTrack: null,
  remoteAudioTracks: {},
};

let micMuted = true;
let rtcClient;
let rtmClient;
let channel;
let avatar;  // User avatar

const initRtm = async (name) => {
  rtmClient = AgoraRTM.createInstance(appid);
  await rtmClient.login({ 'uid': rtmUid, 'token': token });

  channel = rtmClient.createChannel(roomId);
  await channel.join();

  // Ensure avatar is set or assign a default
  avatar = avatar || 'default-avatar.png';

  // Add user attributes with name, RTC UID, and avatar
  await rtmClient.addOrUpdateLocalUserAttributes({ 'name': name, 'userRtcUid': rtcUid.toString(), 'userAvatar': avatar });

  getChannelMembers();

  window.addEventListener('beforeunload', leaveRtmChannel);

  channel.on('MemberJoined', handleMemberJoined);
  channel.on('MemberLeft', handleMemberLeft);
};

const initRtc = async () => {
  rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

  rtcClient.on("user-published", handleUserPublished);
  rtcClient.on("user-left", handleUserLeft);

  await rtcClient.join(appid, roomId, token, rtcUid);
  audioTracks.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
  audioTracks.localAudioTrack.setMuted(micMuted);
  await rtcClient.publish(audioTracks.localAudioTrack);

  initVolumeIndicator();
};

let initVolumeIndicator = async () => {
  AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL', 200);
  rtcClient.enableAudioVolumeIndicator();

  rtcClient.on("volume-indicator", (volumes) => {
    volumes.forEach((volume) => {
      console.log(`UID ${volume.uid} Level ${volume.level}`);

      // Ensure item exists before accessing style
      let item = document.getElementsByClassName(`avatar-${volume.uid}`)[0];
      if (item) {
        item.style.borderColor = volume.level >= 50 ? '#00ff00' : '#fff';
      }
    });
  });
};

const handleUserPublished = async (user, mediaType) => {
  await rtcClient.subscribe(user, mediaType);
  if (mediaType === "audio") {
    audioTracks.remoteAudioTracks[user.uid] = [user.audioTrack];
    user.audioTrack.play();
  }
};

const handleUserLeft = async (user) => {
  delete audioTracks.remoteAudioTracks[user.uid];
};

const handleMemberLeft = async (MemberId) => {
  document.getElementById(MemberId)?.remove();
};

// Add user to the display
const addUserToDisplay = (id, name, avatarUrl) => {
  const userHtml = `
    <div class="speaker user-rtc-${id}" id="${id}">
      <img class="user-avatar avatar-${id}" src="${avatarUrl}" />
      <p>${name}</p>
    </div>`;
  document.getElementById("members").insertAdjacentHTML('beforeend', userHtml);
};

// Handle a new member joining
const handleMemberJoined = async (MemberId) => {
  const { name, userRtcUid, userAvatar } = await rtmClient.getUserAttributesByKeys(MemberId, ['name', 'userRtcUid', 'userAvatar']);
  addUserToDisplay(MemberId, name, userAvatar);
};

// Get all channel members and display them
const getChannelMembers = async () => {
  const members = await channel.getMembers();
  for (let memberId of members) {
    const { name, userRtcUid, userAvatar } = await rtmClient.getUserAttributesByKeys(memberId, ['name', 'userRtcUid', 'userAvatar']);
    addUserToDisplay(memberId, name, userAvatar);
  }
};

// Toggle microphone state
const toggleMic = async (e) => {
  micMuted = !micMuted;
  e.target.src = micMuted ? './icons/mic-off.svg' : './icons/mic.svg';
  e.target.style.backgroundColor = micMuted ? 'indianred' : 'ivory';
  audioTracks.localAudioTrack.setMuted(micMuted);
};

// Enter room handler
const enterRoom = async (e) => {
  e.preventDefault();

  if (!avatar) {
    alert('Please select an avatar');
    return;
  }

  roomId = e.target.roomname.value.toLowerCase();
  window.history.replaceState(null, null, `?room=${roomId}`);

  const displayName = e.target.displayname.value;
  initRtc();
  initRtm(displayName);

  document.getElementById('form').style.display = 'none';
  document.getElementById('room-header').style.display = "flex";
  document.getElementById('room-name').innerText = roomId;
};

// Leave RTM channel
const leaveRtmChannel = async () => {
  await channel.leave();
  await rtmClient.logout();
};

// Leave room handler
const leaveRoom = async () => {
  audioTracks.localAudioTrack.stop();
  audioTracks.localAudioTrack.close();
  await rtcClient.unpublish();
  await rtcClient.leave();

  leaveRtmChannel();

  document.getElementById('form').style.display = 'block';
  document.getElementById('room-header').style.display = 'none';
  document.getElementById('members').innerHTML = '';
};

// Event listeners
document.getElementById('form').addEventListener('submit', enterRoom);
document.getElementById('leave-icon').addEventListener('click', leaveRoom);
document.getElementById('mic-icon').addEventListener('click', toggleMic);

// Avatar selection handler
const avatars = document.getElementsByClassName('avatar-selection');
for (let i = 0; avatars.length > i; i++) {
  avatars[i].addEventListener('click', () => {
    for (let j = 0; j < avatars.length; j++) {
      avatars[j].style.borderColor = "#fff";
      avatars[j].style.opacity = 0.5;
    }
    avatar = avatars[i].src;
    avatars[i].style.borderColor = "#00ff00";
    avatars[i].style.opacity = 1;
  });
}
