#!/bin/bash

# note, reminder, event, todo, task

curl -X POST -H "Content-Type: application/json" -d '{
	"text": "Traffic is faster on the left lanes of the highway, which is why they are called passing lanes.",
	"user": "navaz"
}' https://voice-recorder.navaz.workers.dev/test-dictation
