const gradients = [
    'from-purple-500 to-indigo-600',
    'from-pink-500 to-rose-500',
    'from-emerald-400 to-teal-500',
    'from-orange-400 to-red-500',
    'from-sky-400 to-blue-600',
    'from-fuchsia-500 to-purple-700',
]

function hashString(str: string) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    return Math.abs(hash)
}

export function getAvatarGradient(seed: string) {
    return gradients[hashString(seed) % gradients.length]
}
