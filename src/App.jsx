import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import './App.css'

const tierConfiguration = {
  Free: 5,
  Standard: 20,
  Pro: 50,
}

const profileStorageKey = 'soulsync.profileId'

function getYesCountStorageKey(userId) {
  const today = new Date().toISOString().slice(0, 10)
  return `soulsync.yesCount.${userId}.${today}`
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Request failed (${response.status}).`)
    error.status = response.status
    throw error
  }

  return payload
}

function getCompatibilityScore(profile) {
  if (typeof profile?.score === 'number') return profile.score
  const { pace = 0, values = 0, lifestyle = 0, money = 0 } = profile?.compatibility || {}
  return Math.round((pace + values + lifestyle + money) / 4)
}

const nebulaVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const nebulaFragmentShader = `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec3 uAccent;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p = p * 2.03 + vec2(13.7, 8.2);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float time = uTime * 0.018;
    float clouds = fbm(p * 2.1 + vec2(time * 0.31, -time * 0.18));
    float wisps = fbm(p * 4.2 - vec2(time * 0.19, time * 0.28));
    float veil = smoothstep(0.31, 0.83, clouds * 0.7 + wisps * 0.38);
    float heart = exp(-length((p - vec2(-0.17, 0.04)) * vec2(0.8, 1.1)) * 2.1);
    float current = sin(p.x * 2.8 + p.y * 2.2 + clouds * 5.0 - time) * 0.5 + 0.5;
    vec3 deep = vec3(0.009, 0.011, 0.031);
    vec3 violet = vec3(0.2, 0.12, 0.48);
    vec3 teal = vec3(0.025, 0.25, 0.29);
    vec3 nebula = mix(violet, uAccent, 0.44) * smoothstep(0.22, 0.92, wisps);
    nebula += teal * smoothstep(0.55, 0.94, current) * veil * 0.65;
    vec3 color = deep + nebula * veil * 0.74 + violet * heart * veil * 0.16;
    float stars = step(0.9984, hash(floor(gl_FragCoord.xy * 0.47)));
    color += stars * (0.25 + 0.35 * sin(uTime * 0.8 + hash(floor(gl_FragCoord.xy)) * 6.28));
    gl_FragColor = vec4(color, 1.0);
  }
`

const planetVertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vUv = uv;
    vPosition = normalize(position);
    float elevation = noise(vPosition * 7.0 + vec3(0.0, 0.0, 0.0)) * 0.012;
    vec3 displaced = position + normal * elevation;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

const planetFragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uAccent;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p = p * 2.04 + vec3(7.1, 13.4, 3.7);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 p = normalize(vPosition);
    float time = uTime * 0.035;
    float continent = fbm(p * 4.6 + vec3(time * 0.5, 0.0, -time * 0.19));
    float cloud = fbm(p * 10.0 - vec3(time * 0.3, time * 0.18, 0.0));
    float detail = fbm(p * 25.0 + vec3(-time * 0.12, time * 0.1, 0.0));
    float land = smoothstep(0.44, 0.66, continent + (cloud - 0.5) * 0.22);
    float veins = pow(1.0 - abs(sin((continent * 5.4 + cloud * 2.2 + p.y * 3.0) * 3.14159)), 18.0);

    vec3 ocean = mix(vec3(0.014, 0.025, 0.09), uAccent * 0.24, cloud * 0.34);
    vec3 earth = mix(vec3(0.035, 0.38, 0.4), uAccent * 0.92 + vec3(0.12, 0.12, 0.21), cloud * 0.72);
    earth += vec3(0.16, 0.27, 0.37) * detail * 0.48;
    vec3 surface = mix(ocean, earth, land);
    surface += vec3(0.28, 0.74, 0.88) * veins * (0.12 + land * 0.52);

    vec3 normal = normalize(vNormal);
    vec3 light = normalize(vec3(-0.52, 0.53, 1.2));
    float daylight = max(dot(normal, light), 0.0);
    float terminator = smoothstep(-0.32, 0.42, dot(normal, light));
    float fresnel = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 3.4);
    float cloudlight = smoothstep(0.53, 0.8, cloud) * land;

    vec3 color = surface * (0.19 + daylight * 1.2);
    color += surface * cloudlight * (0.17 + daylight * 0.35);
    color *= mix(0.62, 1.0, terminator);
    color += uAccent * fresnel * 0.72;
    color += vec3(0.28, 0.72, 0.88) * fresnel * 0.2;
    gl_FragColor = vec4(color, 1.0);
  }
`

const atmosphereVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragmentShader = `
  precision highp float;
  uniform vec3 uAccent;
  varying vec3 vNormal;
  void main() {
    float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.6);
    gl_FragColor = vec4(uAccent * 0.86 + vec3(0.15, 0.24, 0.36), rim * 0.74);
  }
`

function seededValue(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function Nebula({ accent }) {
  const materialRef = useRef(null)
  const { size, gl } = useThree()
  const uniforms = useMemo(() => ({
    uResolution: { value: new THREE.Vector2(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio()) },
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(accent || '#a78bfa') },
  }), [accent, gl, size.height, size.width])

  useFrame((state) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh position={[0, 0, -700]}>
      <planeGeometry args={[size.width, size.height]} />
      <shaderMaterial
        ref={materialRef}
        depthWrite={false}
        fragmentShader={nebulaFragmentShader}
        uniforms={uniforms}
        vertexShader={nebulaVertexShader}
      />
    </mesh>
  )
}

function Starfield() {
  const { size } = useThree()
  const geometry = useMemo(() => {
    const count = Math.min(1100, Math.max(420, Math.round((size.width * size.height) / 1500)))
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (seededValue(index * 5 + 1) - 0.5) * size.width
      positions[index * 3 + 1] = (seededValue(index * 5 + 2) - 0.5) * size.height
      positions[index * 3 + 2] = -100 - seededValue(index * 5 + 3) * 500
      sizes[index] = 0.35 + seededValue(index * 5 + 4) * 1.3
      phases[index] = seededValue(index * 5 + 5) * Math.PI * 2
    }

    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    nextGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    nextGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return nextGeometry
  }, [size.height, size.width])

  useEffect(() => () => geometry.dispose(), [geometry])

  const materialRef = useRef(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const vertexShader = `
      uniform float uTime;
      attribute float aSize;
      attribute float aPhase;
      varying float vAlpha;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = aSize * (0.82 + 0.4 * sin(uTime * 0.72 + aPhase));
        vAlpha = 0.26 + 0.58 * (0.5 + 0.5 * sin(uTime * 0.48 + aPhase));
      }
    `
  const fragmentShader = `
      precision highp float;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float glow = exp(-d * 18.0);
        float core = 1.0 - smoothstep(0.0, 0.28, d);
        vec3 color = mix(vec3(0.48, 0.62, 0.93), vec3(0.79, 0.71, 1.0), core);
        gl_FragColor = vec4(color, glow * vAlpha);
      }
    `

  useFrame((state) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </points>
  )
}

function LivingPlanet({ accent }) {
  const groupRef = useRef(null)
  const planetMaterialRef = useRef(null)
  const { size } = useThree()
  const accentColor = useMemo(() => new THREE.Color(accent || '#a78bfa'), [accent])
  const planetUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(accent || '#a78bfa') },
  }), [accent])
  const atmosphereUniforms = useMemo(() => ({
    uAccent: { value: new THREE.Color(accent || '#a78bfa') },
  }), [accent])
  const mobile = size.width <= 820
  const radius = mobile ? Math.min(size.width * 0.34, 143) : Math.min(size.width * 0.12, 172)
  const centerY = mobile ? size.height * 0.14 : -size.height * 0.015

  useFrame((state, delta) => {
    if (!groupRef.current) return
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, centerY, 3.5, delta)
    groupRef.current.rotation.y += delta * 0.045
    groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.09) * 0.025
    if (planetMaterialRef.current) planetMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <group ref={groupRef} position={[0, centerY, 0]}>
      <mesh scale={radius * 1.12} renderOrder={0}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial
          uniforms={atmosphereUniforms}
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={radius} renderOrder={1}>
        <sphereGeometry args={[1, 160, 160]} />
        <shaderMaterial
          ref={planetMaterialRef}
          uniforms={planetUniforms}
          vertexShader={planetVertexShader}
          fragmentShader={planetFragmentShader}
        />
      </mesh>
      <mesh rotation={[1.08, 0.2, -0.22]} position={[0, 0, -3]} renderOrder={-1}>
        <torusGeometry args={[radius * 1.38, 0.7, 8, 220]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh rotation={[0.28, 0.86, 0.45]} position={[0, 0, -7]} scale={[1, 0.66, 1]} renderOrder={-2}>
        <torusGeometry args={[radius * 1.57, 0.45, 6, 220]} />
        <meshBasicMaterial color="#8cebe1" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Cosmos({ accent }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div aria-hidden="true" className="webgl-cosmos">
      <Canvas
        camera={{ position: [0, 0, 1000], near: 0.1, far: 1800, zoom: 1 }}
        dpr={reducedMotion ? 1 : [1, 1.25]}
        gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
        orthographic
        frameloop={reducedMotion ? 'demand' : 'always'}
        fallback={<div className="webgl-fallback" />}
      >
        <Nebula accent={accent} />
        <Starfield />
        <LivingPlanet accent={accent} />
      </Canvas>
    </div>
  )
}

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="15.5" />
      <ellipse cx="20" cy="20" rx="7" ry="15.5" />
      <ellipse cx="20" cy="20" rx="15.5" ry="6.5" transform="rotate(-32 20 20)" />
      <circle className="brand-star" cx="31" cy="10" r="2.2" />
    </svg>
  )
}

function App() {
  const [tier, setTier] = useState('Free')
  const [tiers, setTiers] = useState(tierConfiguration)
  const [dailyLimit, setDailyLimit] = useState(tierConfiguration.Free)
  const [profiles, setProfiles] = useState([])
  const [profileIndex, setProfileIndex] = useState(0)
  const [profileId, setProfileId] = useState(null)
  const [yesCount, setYesCount] = useState(0)
  const [decision, setDecision] = useState('Your next meaningful connection starts with curiosity.')
  const [matchState, setMatchState] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let isActive = true

    async function initialize() {
      setIsReady(false)
      setError('')
      try {
        const id = localStorage.getItem(profileStorageKey) || crypto.randomUUID()
        localStorage.setItem(profileStorageKey, id)
        const config = await request('/api/config')
        if (!isActive) return

        const nextTiers = config.tiers || tierConfiguration
        setTiers(nextTiers)
        setDailyLimit(nextTiers.Free ?? tierConfiguration.Free)
        const profileResponse = await request('/api/profiles')
        if (!isActive) return

        const nextProfiles = profileResponse.profiles || []
        setProfiles(nextProfiles)
        setProfileId(id)
        setYesCount(Number(localStorage.getItem(getYesCountStorageKey(id))) || 0)
        setIsReady(true)
      } catch (initializationError) {
        if (!isActive) return
        setError(initializationError.message)
        setIsReady(true)
      }
    }

    initialize()
    return () => {
      isActive = false
    }
  }, [retryCount])

  const currentProfile = profiles[profileIndex]
  const compatibilityScore = useMemo(
    () => getCompatibilityScore(currentProfile),
    [currentProfile],
  )
  const remainingSelections = Math.max(dailyLimit - yesCount, 0)

  const handleTierChange = (nextTier) => {
    setTier(nextTier)
    setDailyLimit(tiers[nextTier] ?? tierConfiguration.Free)
    setDecision('Your daily rhythm has been updated.')
  }

  const handleDecisionClick = async (nextDecision) => {
    if (!currentProfile || !profileId || isSubmitting) return
    if (nextDecision && yesCount >= dailyLimit) {
      setDecision('Your daily curiosity limit has been reached. The field will reopen tomorrow.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const result = await request('/api/decision', {
        method: 'POST',
        body: JSON.stringify({
          userId: profileId,
          profileId: currentProfile.id,
          action: nextDecision ? 'yes' : 'no',
          tier,
        }),
      })

      if (typeof result.remaining === 'number' && typeof result.limit === 'number') {
        const count = Math.max(result.limit - result.remaining, 0)
        setYesCount(count)
        localStorage.setItem(getYesCountStorageKey(profileId), String(count))
      }

      setDecision(
        result.match
          ? 'A rare alignment is opening. Date planning is available.'
          : result.message || 'Your intention has been received.',
      )
      setMatchState(result.match || null)
      setProfileIndex((index) => (index + 1) % profiles.length)
    } catch (voteError) {
      if (voteError.status === 429) {
        setYesCount(dailyLimit)
        localStorage.setItem(getYesCountStorageKey(profileId), String(dailyLimit))
      }
      setError(voteError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell" style={{ '--current-accent': currentProfile?.accent || '#a78bfa' }}>
      <Cosmos accent={currentProfile?.accent} />
      <div aria-hidden="true" className="ambient-vignette" />

      <header className="topbar">
        <a aria-label="SoulSite home" className="brand" href="/">
          <BrandMark />
          <span>Soul<span className="brand-light">Site</span></span>
        </a>
        <div className="topbar-center">
          <span className="live-indicator" />
          <span>THE FIELD IS OPEN</span>
        </div>
        <div className="tier-picker">
          <label htmlFor="tier">YOUR DAILY RHYTHM</label>
          <select
            id="tier"
            value={tier}
            onChange={(event) => handleTierChange(event.target.value)}
          >
            {Object.keys(tiers).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span aria-hidden="true" className="select-chevron">⌄</span>
        </div>
      </header>

      <main className="discovery-grid">
        <section aria-label="About this connection" className="story-stream">
          <div className="encounter-count">
            <span className="section-index">01</span>
            <span>OF {String(profiles.length || 0).padStart(2, '0')} ENCOUNTERS</span>
          </div>
          <div className="story-rule" />
          <p className="eyebrow">Beyond the surface</p>
          <h1>A quieter kind<br />of <span>chemistry.</span></h1>
          <p className="story-intro">
            No swiping through faces. Meet someone through the things that make you, you.
          </p>

          {currentProfile ? (
            <div className="profile-story" key={currentProfile.id}>
              <p className="story-label">THEIR INTENTION</p>
              <p className="intention">{currentProfile.intention}</p>
              <div className="story-rule story-rule-short" />
              <p className="story-label">A NOTE FROM {currentProfile.name?.toUpperCase()}</p>
              <p className="bio-copy">{currentProfile.bio}</p>
              <p className="energy-note">
                <span aria-hidden="true">✳</span> {currentProfile.energy}
              </p>
            </div>
          ) : (
            <div aria-live="polite" className="profile-story loading-copy">
              {error ? (
                <>
                  <p>{error}</p>
                  <button className="text-action" onClick={() => setRetryCount((count) => count + 1)} type="button">
                    Reconnect to the field <span aria-hidden="true">↗</span>
                  </button>
                </>
              ) : (
                <p>{isReady ? 'There are no connections in the field just yet.' : 'Finding your place in the universe…'}</p>
              )}
            </div>
          )}
        </section>

        <section aria-label="A potential connection" className="encounter">
          <div className="encounter-topline">
            <span><span className="live-indicator" /> ANONYMOUS BY DESIGN</span>
            <span>NO PHOTOS · NO MESSAGES</span>
          </div>

          <div className="orb-composition">
            {currentProfile ? (
              <>
                <div className="identity-line" key={`identity-${currentProfile.id}`}>
                  <span className="identity-location">
                    {currentProfile.age ? `${currentProfile.age} YEARS` : 'SOUL IN MOTION'}
                    <span className="identity-dot">·</span>
                    {currentProfile.distance || 'NEARBY'}
                  </span>
                  <h2>{currentProfile.name || 'A new connection'}</h2>
                </div>
              </>
            ) : (
              <div aria-live="polite" className="encounter-empty">
                <span className={isReady ? 'empty-glyph' : 'loader-orbit'} aria-hidden="true">
                  {isReady ? '✧' : ''}
                </span>
                <p>{error ? 'Your signal is resting.' : isReady ? 'The universe is still unfolding.' : 'Tuning into the field'}</p>
              </div>
            )}
          </div>

          <div className="encounter-footnote">
            <span>CONNECTION, WITHOUT THE PERFORMANCE</span>
            <span aria-hidden="true" className="footnote-star">✳</span>
          </div>
        </section>

        <aside aria-label="Compatibility details" className="resonance-stream">
          <div className="resonance-heading">
            <span className="section-index">02</span>
            <p className="eyebrow">Your resonance</p>
          </div>
          <div className="score-constellation">
            <svg aria-hidden="true" className="score-ring" viewBox="0 0 140 140">
              <circle className="score-track" cx="70" cy="70" r="62" />
              <circle
                className="score-progress"
                cx="70"
                cy="70"
                r="62"
                style={{ strokeDasharray: `${(compatibilityScore * 390) / 100} 390` }}
              />
            </svg>
            <div className="score-reading">
              <strong>{currentProfile ? compatibilityScore : '—'}<span>{currentProfile ? '%' : ''}</span></strong>
              <small>ALIGNMENT</small>
            </div>
          </div>
          <p className="resonance-caption">
            {currentProfile
              ? 'A signal across values, pace, and the shape of everyday life.'
              : 'A feeling of alignment is waiting to be discovered.'}
          </p>

          <div className="resonance-divider"><span>WHAT MATTERS TO THEM</span><i /></div>
          <ul className="value-list">
            {(currentProfile?.values || []).map((value, index) => (
              <li key={value} style={{ '--value-delay': `${index * 100}ms` }}>
                <span aria-hidden="true">✳</span>{value}
              </li>
            ))}
          </ul>

          {currentProfile?.tags?.length ? (
            <div className="shared-world">
              <p className="story-label">THEIR LITTLE UNIVERSE</p>
              <p>{currentProfile.tags.join('  ·  ')}</p>
            </div>
          ) : null}

          <div aria-live="polite" className={`signal-note${error ? ' has-error' : ''}`}>
            <span className="signal-pulse" />
            <p>{error || decision}</p>
          </div>
          {matchState ? (
            <div className="match-reveal">
              <span className="story-label">{matchState.label}</span>
              <strong>{matchState.venue}</strong>
              <span>{matchState.time}</span>
            </div>
          ) : null}
        </aside>
      </main>

      <footer className="decision-dock">
        <div className="daily-balance">
          <span className="balance-number">{String(remainingSelections).padStart(2, '0')}</span>
          <span>CURIOUS MOMENTS<br />REMAINING TODAY</span>
        </div>
        <div className="decision-actions">
          <button
            aria-label="Pass on this connection"
            className="decision-button pass-button"
            disabled={!currentProfile || isSubmitting}
            onClick={() => handleDecisionClick(false)}
            type="button"
          >
            <span aria-hidden="true" className="decision-icon">−</span>
            <span>LET THIS ONE PASS</span>
          </button>
          <span aria-hidden="true" className="dock-divider" />
          <button
            aria-label="Express interest in this connection"
            className="decision-button yes-button"
            disabled={!currentProfile || isSubmitting || remainingSelections === 0}
            onClick={() => handleDecisionClick(true)}
            type="button"
          >
            <span aria-hidden="true" className="decision-icon">✳</span>
            <span>{isSubmitting ? 'SENDING YOUR SIGNAL…' : 'I’M CURIOUS'}</span>
          </button>
        </div>
        <div aria-hidden="true" className="privacy-promise">
          <span>01</span> PRIVATE BY NATURE
        </div>
      </footer>
    </div>
  )
}

export default App
