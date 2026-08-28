import unittest
from unittest.mock import Mock, patch

from main import API_SECRET, SONG_READY_WEBHOOK_URL, notify_song_ready


class ReadyNotificationTests(unittest.TestCase):
    @patch("main.requests.post")
    def test_ready_webhook_is_authenticated_and_bounded(self, post_mock):
        response = Mock()
        response.json.return_value = {"subscriptions": 1, "sent": 1, "removed": 0}
        post_mock.return_value = response

        result = notify_song_ready("song-123")

        self.assertEqual(result, {"subscriptions": 1, "sent": 1, "removed": 0})
        post_mock.assert_called_once_with(
            SONG_READY_WEBHOOK_URL,
            json={"song_id": "song-123"},
            headers={"Authorization": f"Bearer {API_SECRET}"},
            timeout=15,
        )
        response.raise_for_status.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
