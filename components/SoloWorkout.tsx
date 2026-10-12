"use client";
/**
 * Solo / Training / Bot match with MediaPipe pose detection.
 * mode: "training" | "bot"
 */
import { useState, useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

export type BotDifficulty = "easy" | "medium" | "hard";

interface SoloWorkoutProps {
  mode: "training" | "bot";
  duration: number; // seconds
  difficulty?: BotDifficulty;
  userName: string;
  onFinish: (result: {
    myReps: number;
    botReps: number;
    duration: number;
  }) => void;
  onExit: () => void;
}

function botTargetReps(duration: number, difficulty: BotDifficulty): number {
  const perMin = difficulty === "easy" ? 18 : difficulty === "medium" ? 28 : 40;
  return Math.max(5, Math.round((duration / 60) * perMin + (Math.random() * 4 - 2)));
}

export default function SoloWorkout({
  mode,
  duration,
  difficulty = "medium",
  userName,
  onFinish,
  onExit,
}: SoloWorkoutProps) {
  const [phase, setPhase] = useState<"loading" | "calibrating" | "countdown" | "playing" | "ended">("loading");
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [myReps, setMyReps] = useState(0);
  const [botReps, setBotReps] = useState(0);
  const [debugInfo, setDebugInfo] = useState("Loading AI...");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isDownRef = useRef(false);
  const myRepsRef = useRef(0);
  const botTargetRef = useRef(botTargetReps(duration, difficulty));
  const startTimeRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    myRepsRef.current = myReps;
  }, [myReps]);

  // Camera + MediaPipe
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            videoRef.current?.play();
            setPhase("calibrating");
            setDebugInfo("Calibrating...");
          };
        }
      } catch (err) {
        console.error(err);
        alert("Camera access is required. Please allow the camera and try again.");
        onExit();
      }
    }
    setup();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onExit]);

  // Calibration 2s → countdown
  useEffect(() => {
    if (phase !== "calibrating") return;
    const t = setTimeout(() => {
      setPhase("countdown");
      setCountdown(3);
    }, 2000);
    return () => clearTimeout(t);
  }, [phase]);

  // Countdown 3-2-1
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    setPhase("playing");
    startTimeRef.current = Date.now();
  }, [phase, countdown]);

  // Match timer
  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      if (!finishedRef.current) {
        finishedRef.current = true;
        setPhase("ended");
        onFinish({ myReps: myRepsRef.current, botReps, duration });
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, botReps, duration, onFinish]);

  // Bot reps progress during playing
  useEffect(() => {
    if (phase !== "playing" || mode !== "bot") return;
    const target = botTargetRef.current;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const progress = Math.min(1, elapsed / duration);
      // ease-in curve so bot is slower at start
      const eased = Math.pow(progress, 0.85);
      const noise = Math.sin(elapsed * 1.7) * 0.5;
      setBotReps(Math.min(target, Math.max(0, Math.floor(target * eased + noise))));
    }, 400);
    return () => clearInterval(interval);
  }, [phase, mode, duration]);

  // Pose detection loop
  useEffect(() => {
    if (phase !== "calibrating" && phase !== "playing") return;

    const detect = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const result = landmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);

      if (result.landmarks && result.landmarks[0]) {
        const lm = result.landmarks[0];
        const drawingUtils = new DrawingUtils(ctx);
        drawingUtils.drawLandmarks(lm, { color: "#22C55E", lineWidth: 1, radius: 3 });
        drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
          color: "#3B82F6",
          lineWidth: 2,
        });

        // Shoulders 11,12 elbows 13,14 wrists 15,16
        const ls = lm[11], rs = lm[12], le = lm[13], re = lm[14], lw = lm[15], rw = lm[16];
        if (ls && rs && le && re && lw && rw) {
          const elbowY = (le.y + re.y) / 2;
          const shoulderY = (ls.y + rs.y) / 2;
          const wristY = (lw.y + rw.y) / 2;

          // Simple heuristic: down when elbows near/below shoulders and wrists lower
          const isDown = elbowY > shoulderY + 0.04 && wristY > shoulderY;

          if (phase === "playing") {
            if (isDown && !isDownRef.current) {
              isDownRef.current = true;
              setDebugInfo("DOWN");
            } else if (!isDown && isDownRef.current) {
              isDownRef.current = false;
              setMyReps((r) => r + 1);
              setDebugInfo("REP!");
            }
          } else {
            setDebugInfo("Pose OK — hold plank");
          }
        }
      } else {
        setDebugInfo("Step into frame");
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="relative min-h-screen bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center p-3 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onExit} className="text-white/80 text-sm font-bold px-3 py-1 rounded bg-white/10">
          EXIT
        </button>
        <div className="font-display font-bold text-2xl text-white tabular-nums">
          {mm}:{ss}
        </div>
        <div className="text-xs text-slate-300 font-bold uppercase">
          {mode === "bot" ? `BOT · ${difficulty}` : "TRAINING"}
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-0" playsInline muted />
        <canvas ref={canvasRef} className="w-full h-full object-contain max-h-[70vh]" />

        {phase !== "playing" && phase !== "ended" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <div className="text-center">
              {phase === "loading" && <p className="text-white text-xl font-display font-bold">Loading camera...</p>}
              {phase === "calibrating" && (
                <p className="text-green-light text-xl font-display font-bold animate-pulse">Calibrating pose...</p>
              )}
              {phase === "countdown" && (
                <p className="text-white text-7xl font-display font-extrabold animate-ping-once">
                  {countdown > 0 ? countdown : "GO!"}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="z-20 p-4 bg-surface border-t border-slate-800">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <div className="text-center">
            <div className="text-xs text-slate-400 font-bold uppercase">{userName}</div>
            <div className="text-4xl font-display font-extrabold text-green-light">{myReps}</div>
          </div>
          {mode === "bot" && (
            <>
              <div className="text-slate-600 font-bold text-xl">VS</div>
              <div className="text-center">
                <div className="text-xs text-slate-400 font-bold uppercase">BOT</div>
                <div className="text-4xl font-display font-extrabold text-blue-light">{botReps}</div>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-xs text-slate-500 mt-2">{debugInfo}</p>
      </div>
    </div>
  );
}
