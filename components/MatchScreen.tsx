"use client";
import { useState, useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { socket } from "@/lib/socket";

interface User {
  name: string;
  elo: number;
}

export interface MatchData {
  matchId: string;
  opponentName: string;
  opponentElo: number;
  duration: number;
  startTime: number;
}

interface MatchScreenProps {
  user: User;
  duration: number;
  matchData: MatchData;
  onMatchEnd: () => void;
  onExit: () => void;
}

export default function MatchScreen({ user, duration, matchData, onMatchEnd, onExit }: MatchScreenProps) {
  const [phase, setPhase] = useState<"loading" | "calibrating" | "waiting" | "countdown" | "playing" | "ended">("loading");
  const [countdown, setCountdown] = useState<number>(3);
  const [timeLeft, setTimeLeft] = useState<number>(duration);
  
  const [playerAReps, setPlayerAReps] = useState<number>(0);
  const [playerBReps, setPlayerBReps] = useState<number>(0);
  const [badForm, setBadForm] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>("Waiting for AI...");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const isDownRef = useRef<boolean>(false);
  const calibrationFramesRef = useRef<number[]>([]);
  const baselineElbowAngleRef = useRef<number>(0);
  const baselineBodyAngleRef = useRef<number>(0);

  // 1. Initialize MediaPipe
  useEffect(() => {
    async function setupLandmarker() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
      landmarkerRef.current = landmarker;
      
      if (navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
          streamRef.current = stream; 
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              videoRef.current?.play();
              setPhase("calibrating");
              
            };
          }
        } catch (err) {
          console.error("Camera access denied or failed", err);
          alert("Camera access is required to play. Please allow camera permissions and try again.");
          if (matchData?.matchId) {
            socket.emit("leave_match", matchData.matchId);
          }
          onExit();
        }
      }
    }
    setupLandmarker();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [matchData, onExit]);

  // 2. Calibration Timer (Runs for 2 seconds, then waits for server)
  useEffect(() => {
    if (phase === "calibrating") {
      console.log("[Client] Calibrating for 2 seconds...");
      const timer = setTimeout(() => {
        console.log("[Client] Calibration finished. Moving to waiting.");
        setPhase("waiting");

        if (matchData?.matchId) {
          socket.emit("player_ready", matchData.matchId);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

    // 3. Real-time Multiplayer Listeners
  useEffect(() => {
    const handleOpponentRep = (reps: number) => setPlayerBReps(reps);
    socket.on("opponent_rep_update", handleOpponentRep);

    socket.on("start_countdown", () => {
      console.log("[Client] Received start_countdown.");
      // Only start countdown if we are already waiting or loading
      setPhase((prev) => {
        if (prev === "waiting" || prev === "loading") return "countdown";
        return prev;
      });
    });

    socket.on("start_match", () => {
      console.log("[Client] Received start_match.");
      // Only start playing if we are in countdown or waiting
      setPhase((prev) => {
        if (prev === "countdown" || prev === "waiting" || prev === "loading") return "playing";
        return prev;
      });
    });

    return () => {
      socket.off("opponent_rep_update", handleOpponentRep);
      socket.off("start_countdown");
      socket.off("start_match");
    };
  }, []);

  // 4. Local Countdown Math (3, 2, 1, GO!)
  useEffect(() => {
    if (phase === "countdown") {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown((c: number) => c - 1), 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [countdown, phase]);

  // 5. Match Timer
  useEffect(() => {
    if (phase === "playing" && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((t: number) => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && phase === "playing") {
      setPhase("ended");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const failsafe = setTimeout(() => onExit(), 5000);
      return () => clearTimeout(failsafe);
    }
  }, [phase, timeLeft, onExit]);

  // 6. AI Detection & Anti-Cheat Loop
  useEffect(() => {
    if (phase !== "calibrating" && phase !== "playing") return;
    
    const detectPose = () => {
      if (!landmarkerRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectPose);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!canvas) {
        rafRef.current = requestAnimationFrame(detectPose);
        return;
      }
      
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(detectPose);
        return;
      }
      
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

      const results = landmarkerRef.current.detectForVideo(video, performance.now());
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawingUtils = new DrawingUtils(ctx);
      
      if (results.landmarks.length > 0) {
        const lm = results.landmarks[0];

        const desiredIndices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

        const bodyConnections = PoseLandmarker.POSE_CONNECTIONS.filter(
          (connection: { start: number; end: number }) => 
            desiredIndices.includes(connection.start) && desiredIndices.includes(connection.end)
        );
        drawingUtils.drawConnectors(lm, bodyConnections, { color: "#4ADE80", lineWidth: 6 });
        const filteredLandmarks = desiredIndices.map(i => lm[i]).filter(Boolean);
        drawingUtils.drawLandmarks(filteredLandmarks, { color: "#22C55E", radius: 5 });

        // ponytail: helper for angle calc - could use a vector lib but 3 lines vs dependency
        const angle = (a: {x: number, y: number}, b: {x: number, y: number}, c: {x: number, y: number}) => {
          const ba = { x: a.x - b.x, y: a.y - b.y };
          const bc = { x: c.x - b.x, y: c.y - b.y };
          const dot = ba.x * bc.x + ba.y * bc.y;
          const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
          const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
          return Math.acos(dot / (magBA * magBC)) * (180 / Math.PI);
        };

        const vis = (idx: number) => lm[idx] && lm[idx].visibility !== undefined && lm[idx].visibility > 0.5;

        // Check just the essential landmarks for detection
        if (vis(11) && vis(12) && vis(13) && vis(14) && vis(15) && vis(16)) {
          const leftShoulder = lm[11], rightShoulder = lm[12];
          const leftElbow = lm[13], rightElbow = lm[14];
          const leftWrist = lm[15], rightWrist = lm[16];
          const leftHip = lm[23], rightHip = lm[24];
          const leftKnee = lm[25], rightKnee = lm[26];

          // Key metric: elbow angle (works from any angle)
          const leftElbowAngle = angle(leftShoulder, leftElbow, leftWrist);
          const rightElbowAngle = angle(rightShoulder, rightElbow, rightWrist);
          const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

          // Body alignment check: shoulder-hip-knee should be straight (if visible)
          let avgBodyAngle = 180; // default to valid if not visible
          if (vis(23) && vis(24) && vis(25) && vis(26)) {
            const leftBodyAngle = angle(leftShoulder, leftHip, leftKnee);
            const rightBodyAngle = angle(rightShoulder, rightHip, rightKnee);
            avgBodyAngle = (leftBodyAngle + rightBodyAngle) / 2;
          }

          if (phase === "calibrating") {
            // Collect multiple frames for stable baseline
            calibrationFramesRef.current.push(avgElbowAngle);
            if (calibrationFramesRef.current.length > 10) {
              const sorted = [...calibrationFramesRef.current].sort((a, b) => a - b);
              baselineElbowAngleRef.current = sorted[Math.floor(sorted.length / 2)]; // median
              baselineBodyAngleRef.current = avgBodyAngle;
            }
          } else if (phase === "playing") {
            const baselineElbow = baselineElbowAngleRef.current;

            if (baselineElbow > 100) { // sanity check: arms should be extended at start
              const downThreshold = 90; // elbow bent to ~90 degrees
              const upThreshold = baselineElbow - 20; // nearly extended
              const bodyAlignmentThreshold = 160; // body should stay straight (>160 degrees)

              setDebugInfo(`Elbow: ${avgElbowAngle.toFixed(0)}° | Body: ${avgBodyAngle.toFixed(0)}° | State: ${isDownRef.current ? 'DOWN' : 'UP'}`);

              if (avgElbowAngle < downThreshold && !isDownRef.current) {
                isDownRef.current = true;
              } else if (avgElbowAngle > upThreshold && isDownRef.current) {
                // Check form: body should stay straight (no sagging/piking)
                if (avgBodyAngle < bodyAlignmentThreshold) {
                  isDownRef.current = false;
                  setBadForm(true);
                  setTimeout(() => setBadForm(false), 2000);
                } else {
                  isDownRef.current = false;
                  setPlayerAReps((prev: number) => {
                    const newReps = prev + 1;
                    socket.emit("rep_update", matchData.matchId, newReps);
                    return newReps;
                  });
                }
              }
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(detectPose);
    };

    rafRef.current = requestAnimationFrame(detectPose);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, matchData]);

  const handleExit = () => {
    if (matchData?.matchId) {
      socket.emit("leave_match", matchData.matchId);
    }
    onExit();
  };

  const totalReps = playerAReps + playerBReps;
  const growA = totalReps === 0 ? 1 : playerAReps;
  const growB = totalReps === 0 ? 1 : playerBReps;
  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  return (
    <div className="h-screen w-screen flex flex-col bg-background relative overflow-hidden">
      
      {/* Top Navbar */}
      <div className="flex-shrink-0 flex justify-between items-center p-2 sm:p-4 z-30 bg-background border-b border-slate-800">
        <button onClick={handleExit} className="text-slate-400 hover:text-white text-xs sm:text-sm font-bold border border-slate-700 px-2 sm:px-3 py-1 rounded">
          EXIT
        </button>
        <div className="text-center">
          <div className="text-xs uppercase text-slate-400 tracking-widest font-bold hidden sm:block">Time Remaining</div>
          <div className="text-2xl sm:text-4xl font-display font-extrabold text-white tabular-nums">
            {formatTime(timeLeft)}
          </div>
        </div>
        <div className="w-[40px] sm:w-[60px]"></div>
      </div>

      {/* TUG OF WAR BAR */}
      <div className="flex-shrink-0 flex h-24 sm:h-32 md:h-40 w-full border-b-4 border-slate-900 shadow-2xl z-20">
        <div
          className="relative bg-green-primary/30 border-r-4 border-green-primary flex flex-col items-center justify-center transition-all duration-500 ease-out overflow-hidden"
          style={{ flexGrow: growB, flexBasis: 0 }}
        >
          <div className="text-green-light text-xs sm:text-sm md:text-lg font-bold uppercase tracking-wider truncate w-full text-center px-1 sm:px-2">
            {matchData.opponentName.toUpperCase()}
          </div>
          <div className="text-green-light text-3xl sm:text-5xl md:text-7xl font-display font-extrabold drop-shadow-lg">
            {playerBReps}
          </div>
        </div>

        <div
          className="relative bg-blue-primary/30 border-l-4 border-blue-primary flex flex-col items-center justify-center transition-all duration-500 ease-out overflow-hidden"
          style={{ flexGrow: growA, flexBasis: 0 }}
        >
          <div className="text-blue-light text-xs sm:text-sm md:text-lg font-bold uppercase tracking-wider truncate w-full text-center px-1 sm:px-2">{user.name}</div>
          <div className="text-blue-light text-3xl sm:text-5xl md:text-7xl font-display font-extrabold drop-shadow-lg">
            {playerAReps}
          </div>
        </div>
      </div>

      {/* AI DEBUG HUD */}
      <div className="absolute top-16 sm:top-20 left-2 sm:left-4 z-40 bg-black/70 text-green-light font-mono text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-2 rounded-lg border border-slate-700 pointer-events-none max-w-[calc(100%-1rem)]">
        {debugInfo}
      </div>

      {/* Bad Form Warning */}
      {badForm && (
        <div className="absolute top-32 sm:top-48 left-1/2 -translate-x-1/2 z-40 bg-red-600 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-lg shadow-lg animate-pulse text-sm sm:text-lg max-w-[90%] text-center">
          BAD FORM! KEEP BODY STRAIGHT
        </div>
      )}

      {/* FIXED CAMERA CONTAINER */}
      <div className="flex-grow relative bg-black flex items-center justify-center overflow-hidden">
        <video 
          ref={videoRef} 
          className="absolute h-full w-full object-cover" 
          style={{ transform: 'scaleX(-1)' }} 
          playsInline 
        />
        <canvas 
          ref={canvasRef} 
          className="absolute h-full w-full object-cover" 
          style={{ transform: 'scaleX(-1)' }} 
        />


        <div className="absolute bottom-3 sm:bottom-6 right-3 sm:right-6 z-10 bg-background/70 backdrop-blur-sm px-3 sm:px-6 py-2 sm:py-3 rounded-xl border border-blue-primary text-right pointer-events-none">
          <div className="text-[10px] sm:text-xs uppercase text-slate-400 tracking-widest font-bold">Your Reps</div>
          <div className="text-3xl sm:text-5xl font-display font-extrabold text-blue-light tabular-nums">
            {playerAReps}
          </div>
        </div>
      </div>

      {/* Overlays */}
      {phase !== "playing" && (
        <div className="absolute inset-0 bg-background/95 z-50 flex flex-col items-center justify-center backdrop-blur-sm px-4">
          {phase === "loading" && (
            <div className="text-xl sm:text-3xl font-display font-bold text-slate-400 animate-pulse text-center">
              INITIALIZING AI TRACKER...
            </div>
          )}

          {phase === "calibrating" && (
            <div className="text-center max-w-md">
              <h2 className="text-xl sm:text-2xl text-blue-light font-bold mb-4 uppercase tracking-widest animate-pulse">
                CALIBRATING BASELINE
              </h2>
              <p className="text-slate-300 text-base sm:text-lg">Hold a strict plank position with arms fully extended</p>
              <p className="text-slate-400 text-xs sm:text-sm mt-2">Face the camera directly or at an angle</p>
              <div className="mt-6 w-48 sm:w-64 h-2 bg-surface rounded-full overflow-hidden mx-auto">
                <div className="h-full bg-blue-primary w-full origin-left animate-[progress_2s_linear_infinite]" style={{transform: 'scaleX(0)'}}></div>
              </div>
            </div>
          )}

          {phase === "waiting" && (
            <div className="text-center max-w-md">
              <h2 className="text-xl sm:text-2xl text-blue-light font-bold mb-4 uppercase tracking-widest animate-pulse">
                WAITING FOR OPPONENT...
              </h2>
              <p className="text-slate-300 text-base sm:text-lg">Opponent is enabling their camera</p>
            </div>
          )}

          {phase === "countdown" && (
            <>
              <h2 className="text-lg sm:text-2xl text-slate-400 font-bold mb-4 uppercase tracking-widest">Get Ready</h2>
              <div key={countdown} className="text-6xl sm:text-9xl font-display font-extrabold text-green-light animate-ping-once">
                {countdown === 0 ? "GO!" : countdown}
              </div>
            </>
          )}

          {phase === "ended" && (
            <div className="text-xl sm:text-3xl font-display font-bold text-green-light animate-pulse text-center">
              CALCULATING RESULTS...
            </div>
          )}
        </div>
      )}
    </div>
  );
}