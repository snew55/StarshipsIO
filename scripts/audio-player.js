// Ensure the background audio is initialized only once
if (!window.backgroundAudio) {
    // Create a new audio element
    const audio = new Audio('../assets/audio/space-ranger-moire-main-version-03-04-10814.mp3');
    
    // Configure the audio
    audio.loop = true;  // Enable looping
    audio.volume = 0.5; // Set the volume (adjust as needed)

    // Add an event listener to start the audio after user interaction
    document.addEventListener('click', () => {
        if (audio.paused) {
            audio.play().catch(err => console.log('Error playing audio:', err));
        }
    });

    // Attach the audio instance to the global window object
    window.backgroundAudio = audio;

    // Optionally, play the audio immediately if autoplay is allowed
    audio.play().catch(() => {
        console.log('Autoplay blocked by browser; waiting for user interaction.');
    });
}