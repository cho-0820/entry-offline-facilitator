import React, { useState } from 'react';

interface IProps {
    onLoginSuccess: (studentCode: string, nickname: string, classroomName: string) => void;
}

export const StudentLoginModal: React.FC<IProps> = ({ onLoginSuccess }) => {
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedCode = code.trim();
        if (!trimmedCode) {
            setErrorMessage('코드를 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setErrorMessage('');

        try {
            const apiUrl = process.env.FACILITATOR_API_URL || 'https://facilitator-api.vercel.app/api/chat';
            // Extract base host for verify API (e.g. from https://host/api/chat to https://host/api/students/verify)
            let baseHost = 'https://facilitator-api.vercel.app';
            if (process.env.FACILITATOR_API_URL) {
                const urlObj = new URL(process.env.FACILITATOR_API_URL);
                baseHost = urlObj.origin;
            }
            const verifyUrl = `${baseHost}/api/students/verify`;

            console.log(`[StudentLogin] Fetching verify API: ${verifyUrl}`);

            const response = await fetch(verifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ student_code: trimmedCode }),
            });

            if (response.status === 404) {
                setErrorMessage('코드를 다시 확인해주세요. 😥');
            } else if (!response.ok) {
                setErrorMessage('서버와 통신하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            } else {
                const data = await response.json();
                if (data.valid) {
                    sessionStorage.setItem('student_code', trimmedCode);
                    sessionStorage.setItem('nickname', data.nickname);
                    sessionStorage.setItem('classroom_name', data.classroom_name);
                    onLoginSuccess(trimmedCode, data.nickname, data.classroom_name);
                } else {
                    setErrorMessage('코드를 다시 확인해주세요. 😥');
                }
            }
        } catch (error) {
            console.error('[StudentLogin] Login connection error:', error);
            setErrorMessage('네트워크 연결이 원활하지 않습니다. 와이파이를 확인해주세요!');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.logoContainer}>
                    <span style={styles.emoji}>🚀</span>
                    <h1 style={styles.title}>AI 코딩 도우미 입장</h1>
                </div>

                <p style={styles.description}>
                    선생님이 나눠주신 <strong>8자리 코드</strong>를 입력해주세요!
                </p>

                <form onSubmit={handleLogin} style={styles.form}>
                    <input
                        type="text"
                        placeholder="예: S3-1-01"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        disabled={isLoading}
                        style={styles.input}
                        autoFocus
                    />

                    {errorMessage && <div style={styles.error}>{errorMessage}</div>}

                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            ...styles.button,
                            ...(isLoading ? styles.buttonDisabled : {}),
                        }}
                    >
                        {isLoading ? '확인 중...' : '코딩하러 가기! ✨'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#f0f2f5',
        fontFamily: '"Nanum Gothic", "Malgun Gothic", sans-serif',
    },
    card: {
        width: '90%',
        maxWidth: '440px',
        padding: '40px 30px',
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
        textAlign: 'center',
    },
    logoContainer: {
        marginBottom: '20px',
    },
    emoji: {
        fontSize: '48px',
        display: 'block',
        marginBottom: '10px',
    },
    title: {
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#333333',
        margin: 0,
    },
    description: {
        fontSize: '15px',
        color: '#666666',
        lineHeight: '1.6',
        margin: '10px 0 30px 0',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '15px',
    },
    input: {
        padding: '15px',
        fontSize: '18px',
        borderRadius: '12px',
        border: '2px solid #ddd',
        textAlign: 'center',
        fontWeight: 'bold',
        letterSpacing: '1px',
        outline: 'none',
        transition: 'border-color 0.2s',
    },
    error: {
        color: '#d9534f',
        fontSize: '14px',
        fontWeight: 'bold',
        marginTop: '5px',
    },
    button: {
        padding: '16px',
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#ffffff',
        backgroundColor: '#007bff',
        border: 'none',
        borderRadius: '12px',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(0, 123, 255, 0.3)',
        transition: 'background-color 0.2s, transform 0.1s',
    },
    buttonDisabled: {
        backgroundColor: '#aaaaaa',
        boxShadow: 'none',
        cursor: 'not-allowed',
    },
};

export default StudentLoginModal;
